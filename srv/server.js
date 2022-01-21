const express   = require("express");
const cds       = require('@sap/cds');
//const path      = require('path');
const xsenv     = require('@sap/xsenv');
const xssec         = require('@sap/xssec');
const passport      = require('passport');

const services = xsenv.getServices({
    uaa: { tags: 'xsuaa', plan: 'application' },
    registry: { label: 'saas-registry' },
    dest: { label: 'destination' }
});
// react on bootstrapping events...
cds.on('bootstrap', (app) => {
    //app.use('/library', express.static(path.join(__dirname, 'resources')));
    
    app.use(passport.initialize());
    passport.use('strategyApprouter', new xssec.JWTStrategy(services.uaa));
    app.use(passport.authenticate('strategyApprouter', { session: false }))

    // Onboard Tenant
    app.put('/callback/v1.0/tenants/*', async(req, res) => {
        const tenantId = req.params[0];        
        res.status(200).send(tenantId);
    });

    // Offboard Tenant
    app.delete('/callback/v1.0/tenants/*', function (req, res) {
        const tenantId = req.params[0];
        res.status(200).send('unsubscribe successful');
    });

    // Tenant Dependencies
    app.get('/callback/v1.0/dependencies', function (req, res) {
        let dependencies = [{'xsappname': services.dest.xsappname}];
        res.status(200).json(dependencies);
    });
});

cds.on('served', (app) => {
    // add more middleware after all CDS services
});

module.exports = cds.server //> delegate to default server.js