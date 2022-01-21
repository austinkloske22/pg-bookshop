# CAP bookshop with Postgres multitenancy

- Official CAP documentation available [here](https://cap.cloud.sap/docs/get-started/in-a-nutshell#start-a-project)


## Getting Started


### Run Locally

bootstrap CAP framework:
``` 
cds init bookshop-mtx --add mta,samples
```

add `dependencies`:
```
npm add cds-pg @sap/xssec passport
```

add `devDependencies`:
```
npm add cds-dbm --save-dev
```

adjust cds-dbm source to to github branch
```JSON 
"devDependencies": {
    "cds-dbm": "github:austinkloske22/cds-dbm#main",
}
```

build
```
npm install
```

create `docker-compose.yml` in project root:
```YML
# Use postgres/example user/password credentials
version: '3.1'

services:

  db:
    image: postgres:alpine
    restart: always
    environment:
      POSTGRES_PASSWORD: postgres
#    volumes:
#      - ./db/data:/tmp/data
#      - ./db/init:/docker-entrypoint-initdb.d/
    ports:
      - '5432:5432'

  adminer:
    image: adminer
    restart: always
    ports:
      - 8080:8080
```

create `Dockerfile` in project root:

```TXT

FROM node:14-buster-slim

RUN apt-get update && apt-get upgrade -y && nodejs -v && npm -v
# causes an error with node:14-buster-slim
# RUN apt-get --no-install-recommends -y install openjdk-11-jre 
WORKDIR /usr/src/app
COPY gen/srv/package.json .
COPY package-lock.json .
RUN npm ci
COPY gen/srv .
COPY app app/
RUN find app -name '*.cds' | xargs rm -f

EXPOSE 4004
# Not needed with node:14-buster-slim
#RUN groupadd --gid 1000 node \
#  && useradd --uid 1000 --gid node --shell /bin/bash --create-home node \
#  && mkdir tmp \
#  && chown node -R tmp
USER node
CMD [ "npm", "start" ]
```

create `default-env.json` in project root:
```JSON
{
  "VCAP_SERVICES": {
    "postgres": [
      {
        "name": "postgres",
        "label": "postgres",
        "tags": ["plain", "database"],
        "credentials": {
          "host": "localhost",
          "port": "5432",
          "database": "pg-bookshop",
          "user": "postgres",
          "password": "postgres"
        }
      }
    ]
  }
}
```

open `package.json` and add the following cds configuration
```JSON
"cds": {
    "requires": {
      "db": {
        "kind": "database"
      },
      "database": {
        "dialect": "plain",
        "impl": "cds-pg",
        "model": [
          "srv"
        ]
      }
    },
    "migrations": {
      "db": {
        "multitenant": true,
        "schema": {
          "default": "public",
          "clone": "_cdsdbm_clone",
          "reference": "_cdsdbm_ref",
          "tenants": [
            "tenant1"
          ]
        },
        "deploy": {
          "tmpFile": "tmp/_autodeploy.json",
          "undeployFile": "db/undeploy.json"
        }
      }
    }
  }
```
manually build `cds-dbm` for deployment. This is a temporary workaround until multitenant functionality is merged and released in cds-dbm. In new terminal:

```
cd node_modules/cds-dbm
npm install
npm run build
sudo chmod 755 ./dist/cli.js
```


from project root start docker for local deployment:
```
npm run docker:start:pg
```

Deploy postgres locally
```
npm run deploy:pg
```

terminal output:
```
pg-bookshop % npm run deploy:pg

> pg-bookshop@1.0.0 deploy:pg
> node_modules/cds-dbm/dist/cli.js deploy --create-db

[cds-dbm] - starting delta database deployment of service db
[cds-dbm] - created database bookshop
[cds-dbm] - Tenant tenant1 synchronized.
[cds-dbm] - delta successfully deployed to the database
pg-bookshop % 
```

run locally:

```
cds run
```

![cds server](/screenshots/cdsServer.png?raw=true "CDS Server")


terminate cds server: `cmd + c`

load sample data and restart CDS Server
```
npm run deploy:pg:load
cds run
```

![sample data](/screenshots/sampleData.png?raw=true "Sample Data")


nice! we've successfully deployed to postgres and loaded data locally.


### Deply Postgres to Cloud

Before we can run on BTP, we'll need need to deploy our database to the cloud.

We'll be using AWS rds for our cloud database instance. Set-up documentation can be found on [AWS's website](https://aws.amazon.com/rds/postgresql/). 

Once your postgres instance is up and running, log into the database using [PG Admin](https://www.pgadmin.org/) and create the database.

![create DB](/screenshots/createDB.png?raw=true "create DB")

open the `default-env.json` and adjust the host and password to reflect the cloud rds instance.

```
{
    "database": "bookshop",
    "host": "postgresaws-frankfurt1.**********.eu-central-1.rds.amazonaws.com",
    "password": "********",
    "port": 5432,
    "user": "postgres",
    "schema": "public"
}
```

Deploy to cloud postgres and load sample data
```
npm run deploy:pg:load
```

![deployed DB](/screenshots/deployedDB.png?raw=true "deployed DB")


### Running on BTP Cloud Foundry

Now that your cloud postgres instance is up and running we'll want to connect our deployed application through a `user-defined microservice`. This can be created using the [CF cli](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html). Substitute in your host url and password.

```
cf login

cf create-user-provided-service pg-bookshop-db -t "relational, database, plain" -p '{
"database": "bookshop",
"host": "postgresaws1.********.**-****-1.rds.amazonaws.com",
"user": "postgres",
"password": "********",
"port": 5432,
"schema": "public" }'
```

```
Creating user provided service pg-bookshop-db in org ****-***-***-cf-eu / space test as austin.kloske@contax.com...
OK
```

open the `mta.yml` and add the pg-bookshop-db resource. Also make sure that pg-bookshop-srv requires it.

![DB Resource](/screenshots/resourceDB.png?raw=true "DB Resource")

Build and deploy
```
mbt build
cf deploy mta_archives/pg-bookshop_0.0.1.mtar
```

![deployed SRV](/screenshots/deployedSRV.png?raw=true "deployed srv")


### Additional micro-services

To run a realistic multitenant scenerio, we'll need to add a few more micro-services to our `mta.yml`. Require those microservices in the srv module.

- pg-bookshop-uaa
- pg-bookshop-registry
- pg-bookshop-dest

![add Services](/screenshots/addServices.png?raw=true "add services")


build and deploy:
```
mbt build
cf deploy mta_archives/pg-bookshop_0.0.1.mtar
```

Navigate to the deployed application and view `pg-bookshop-srv` environment variables:

![environment Variables](/screenshots/environmentVariables.png?raw=true "environment Variables")

Copy the newly created VCAP services to the `default-env.json`. At this point, you can restore the original postgre credentials if you'd like to work with a postgres deployed to docker locally. Feel free to swap between localhost and the rds instance as needed.

```
{
    "host": "localhost",
    "port": "5432",
    "database": "bookshop",
    "user": "postgres",
    "password": "postgres"
}
```

