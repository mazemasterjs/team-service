"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const logger_1 = require("@mazemasterjs/logger");
const Config_1 = __importDefault(require("@mazemasterjs/shared-library/Config"));
const DatabaseManager_1 = __importDefault(require("@mazemasterjs/database-manager/DatabaseManager"));
const Team_1 = require("@mazemasterjs/shared-library/Team");
exports.defaultRouter = express_1.default.Router();
// set module references
const log = logger_1.Logger.getInstance();
const config = Config_1.default.getInstance();
// declare useful constants
const PROJECTION = {};
// declare dbMan - initialized during startup
let dbMan;
/**
 * This just assigns mongo the instance of DatabaseManager.  We shouldn't be
 * able to get here without a database connection and existing instance, but
 * we'll do some logging / error checking anyway.
 */
DatabaseManager_1.default.getInstance()
    .then((instance) => {
    dbMan = instance;
    // enable the "readiness" probe that tells OpenShift that it can send traffic to this service's pod
    config.READY_TO_ROCK = true;
    log.info(__filename, 'DatabaseManager.getInstance()', 'Service is now LIVE, READY, and taking requests.');
})
    .catch((err) => {
    log.error(__filename, 'DatabaseManager.getInstance()', 'Error getting DatabaseManager instance ->', err);
});
/**
 * Response with json team-count value showing the count of all team documents found
 * in the team collection.
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let getTeamCount = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    yield dbMan
        .getDocumentCount(config.MONGO_COL_TEAMS)
        .then((count) => {
        log.debug(__filename, 'getTeamCount()', 'Team Count=' + count);
        res.status(200).json({ collection: config.MONGO_COL_TEAMS, 'team-count': count });
    })
        .catch((err) => {
        res.status(500).json({ status: '500', message: err.message });
    });
});
/**
 * Deletes all mazes found matching the given query parameters
 *
 * @param req
 * @param res
 */
let getTeams = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    const pageSize = 10;
    let pageNum = 1;
    const query = {};
    let teams = new Array();
    let done = false;
    // build the json object containing team parameters to search for
    for (const key in req.query) {
        query[key] = req.query[key];
    }
    log.debug(__filename, 'getTeams()', `Querying teams with parameter(s): ${JSON.stringify(query)}`);
    try {
        // loop through the paged list of teams and return all that match the given query parameters
        while (!done) {
            let page = yield dbMan.getDocuments(config.MONGO_COL_TEAMS, query, PROJECTION, pageSize, pageNum);
            if (page.length > 0) {
                log.debug(__filename, 'getTeams()', `-> Page #${pageNum}, pushing ${page.length} documents into teams array.`);
                // can't easily use Array.concat, so have to loop and push
                for (const teamDoc of page) {
                    // instantiate as Team to validate data
                    try {
                        const team = new Team_1.Team(teamDoc);
                        teams.push(team);
                    }
                    catch (err) {
                        log.warn(__filename, 'getTeams()', 'Invalid team document found in database: _id=' + teamDoc._id);
                    }
                }
            }
            // if we don't have at least pageSize elements, we've hit the last page
            if (page.length < pageSize) {
                done = true;
                log.debug(__filename, 'getTeams()', `-> Finished. ${teams.length} team documents collected from ${pageNum} pages.`);
            }
            else {
                pageNum++;
            }
        }
        // return the results
        log.debug(__filename, 'getTeams()', `Returning ${teams.length} teams.`);
        if (teams.length === 1) {
            res.status(200).json(teams[0]);
        }
        else {
            res.status(200).json(teams);
        }
    }
    catch (err) {
        // log the error and return message
        log.error(__filename, 'getTeams()', `Error while collecting teams ->`, err);
        res.status(500).json({ status: '500', message: err.message });
    }
});
/**
 * Inserts the team from the JSON http body into the mongo database.
 *
 * @param req
 * @param res
 */
let insertTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let team;
    // instantiate as Team to validate document body
    try {
        team = new Team_1.Team(req.body);
    }
    catch (err) {
        log.error(__filename, 'insertTeam(...)', 'Unable to instantiate Team ->', err);
        return res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    }
    yield dbMan
        .insertDocument(config.MONGO_COL_TEAMS, team)
        .then((result) => {
        res.status(200).json(result);
    })
        .catch((err) => {
        log.error(__filename, req.url, 'Error inserting team ->', err);
        res.status(400).json(err);
    });
});
/**
 * Updates the given team with data from json body.
 * TeamID is pulled from json body as well.
 *
 * @param req
 * @param res
 */
let updateTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let team = req.body;
    // instantiate as Team to validate document body
    try {
        team = new Team_1.Team(req.body);
    }
    catch (err) {
        log.error(__filename, 'insertTeam(...)', 'Unable to instantiate Team ->', err);
        return res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    }
    yield dbMan
        .updateDocument(config.MONGO_COL_TEAMS, { id: team.id }, team)
        .then((result) => {
        log.debug(__filename, `updateTeam(${team.id})`, 'Team updated.');
        res.status(200).json(result);
    })
        .catch((err) => {
        log.error(__filename, `updateTeam(${team.id})`, 'Error updating team ->', err);
        res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    });
});
/**
 * Remove the team document with the ID found in req.id and sends result/count as json response
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let deleteTeam = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let query = { id: req.params.teamId };
    yield dbMan
        .deleteDocument(config.MONGO_COL_TEAMS, query)
        .then((result) => {
        log.debug(__filename, req.url, `${result.deletedCount} team(s) deleted.`);
        res.status(200).json(result);
    })
        .catch((err) => {
        log.error(__filename, req.url, 'Error deleting team ->', err);
        res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    });
});
/**
 * Responds with the raw JSON service document unless the "?html"
 * parameter is found, in which case it renderse an HTML document
 * @param req
 * @param res
 */
let getServiceDoc = (req, res) => {
    log.debug(__filename, `Route -> [${req.url}]`, 'Handling request.');
    res.status(200).json(config.SERVICE_DOC);
};
/**
 * Handles undefined routes
 */
let unhandledRoute = (req, res) => {
    log.warn(__filename, `Route -> [${req.method} -> ${req.url}]`, 'Unhandled route, returning 404.');
    res.status(404).json({
        status: '404',
        message: 'Route not found.  See service documentation for a list of endpoints.',
        'service-document': getSvcDocUrl
    });
};
/**
 * Generate and a string-based link to the service document's help section using the
 * given request to determine URL parameters.
 *
 * @param req
 */
function getSvcDocUrl(req) {
    let svcData = config.SERVICE_DOC;
    let ep = svcData.getEndpointByName('service');
    return `${getProtocolHostPort(req)}${svcData.BaseUrl}${ep.Url}`;
}
/**
 * Reconstruct the URL from the Express Request object
 * @param req
 */
function rebuildUrl(req) {
    let svcData = config.SERVICE_DOC;
    return `${getProtocolHostPort(req)}${svcData.BaseUrl}${req.path}`;
}
/**
 * Get and return the protocol, host, and port for the current
 * request.
 *
 * @param req
 */
function getProtocolHostPort(req) {
    return `${req.protocol}://${req.get('host')}`;
}
// Route -> http.get mappings
exports.defaultRouter.get('/get/count', getTeamCount);
exports.defaultRouter.get('/get', getTeams);
exports.defaultRouter.get('/service', getServiceDoc);
// Route -> http.put mappings
exports.defaultRouter.put('/insert', insertTeam);
exports.defaultRouter.put('/update', updateTeam);
// Route -> http.delete mappings
exports.defaultRouter.delete('/delete/:teamId', deleteTeam);
// capture all unhandled routes
exports.defaultRouter.get('/*', unhandledRoute);
exports.defaultRouter.put('/*', unhandledRoute);
exports.defaultRouter.delete('/*', unhandledRoute);
exports.defaultRouter.post('/*', unhandledRoute);
// expose router as module
exports.default = exports.defaultRouter;
//# sourceMappingURL=teamRoutes.js.map