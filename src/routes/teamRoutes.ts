import express from 'express';
import {Logger} from '@mazemasterjs/logger';
import Config from '@mazemasterjs/shared-library/Config';
import Service from '@mazemasterjs/shared-library/Service';
import DatabaseManager from '@mazemasterjs/database-manager/DatabaseManager';
import {Team} from '@mazemasterjs/shared-library/Team';

export const defaultRouter = express.Router();

// set module references
const log: Logger = Logger.getInstance();
const config: Config = Config.getInstance();

// declare useful constants
const PROJECTION = {};

// declare dbMan - initialized during startup
let dbMan: DatabaseManager;

/**
 * This just assigns mongo the instance of DatabaseManager.  We shouldn't be
 * able to get here without a database connection and existing instance, but
 * we'll do some logging / error checking anyway.
 */
DatabaseManager.getInstance()
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
let getTeamCount = async (req: express.Request, res: express.Response) => {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    await dbMan
        .getDocumentCount(config.MONGO_COL_TEAMS)
        .then((count) => {
            log.debug(__filename, 'getTeamCount()', 'Team Count=' + count);
            res.status(200).json({collection: config.MONGO_COL_TEAMS, 'team-count': count});
        })
        .catch((err) => {
            res.status(500).json({status: '500', message: err.message});
        });
};

/**
 * Deletes all mazes found matching the given query parameters
 *
 * @param req
 * @param res
 */
let getTeams = async (req: express.Request, res: express.Response) => {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    const pageSize = 10;
    let pageNum = 1;
    const query: any = {};
    let teams = new Array<Team>();
    let done = false;

    // build the json object containing team parameters to search for
    for (const key in req.query) {
        query[key] = req.query[key];
    }

    log.debug(__filename, 'getTeams()', `Querying teams with parameter(s): ${JSON.stringify(query)}`);

    try {
        // loop through the paged list of teams and return all that match the given query parameters
        while (!done) {
            let page = await dbMan.getDocuments(config.MONGO_COL_TEAMS, query, PROJECTION, pageSize, pageNum);

            if (page.length > 0) {
                log.debug(__filename, 'getTeams()', `-> Page #${pageNum}, pushing ${page.length} documents into teams array.`);

                // can't easily use Array.concat, so have to loop and push
                for (const teamDoc of page) {
                    // instantiate as Team to validate data
                    try {
                        const team = new Team(teamDoc);
                        teams.push(team);
                    } catch (err) {
                        log.warn(__filename, 'getTeams()', 'Invalid team document found in database: _id=' + teamDoc._id);
                    }
                }
            }

            // if we don't have at least pageSize elements, we've hit the last page
            if (page.length < pageSize) {
                done = true;
                log.debug(__filename, 'getTeams()', `-> Finished. ${teams.length} team documents collected from ${pageNum} pages.`);
            } else {
                pageNum++;
            }
        }

        // return the results
        log.debug(__filename, 'getTeams()', `Returning ${teams.length} teams.`);
        if (teams.length === 1) {
            res.status(200).json(teams[0]);
        } else {
            res.status(200).json(teams);
        }
    } catch (err) {
        // log the error and return message
        log.error(__filename, 'getTeams()', `Error while collecting teams ->`, err);
        res.status(500).json({status: '500', message: err.message});
    }
};

/**
 * Inserts the team from the JSON http body into the mongo database.
 *
 * @param req
 * @param res
 */
let insertTeam = async (req: express.Request, res: express.Response) => {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let team: Team;

    // instantiate as Team to validate document body
    try {
        team = new Team(req.body);
    } catch (err) {
        log.error(__filename, 'insertTeam(...)', 'Unable to instantiate Team ->', err);
        return res.status(500).json({status: '500', message: `${err.name} - ${err.message}`});
    }

    await dbMan
        .insertDocument(config.MONGO_COL_TEAMS, team)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err: Error) => {
            log.error(__filename, req.url, 'Error inserting team ->', err);
            res.status(400).json(err);
        });
};

/**
 * Updates the given team with data from json body.
 * TeamID is pulled from json body as well.
 *
 * @param req
 * @param res
 */
let updateTeam = async (req: express.Request, res: express.Response) => {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let team = req.body;

    // instantiate as Team to validate document body
    try {
        team = new Team(req.body);
    } catch (err) {
        log.error(__filename, 'insertTeam(...)', 'Unable to instantiate Team ->', err);
        return res.status(500).json({status: '500', message: `${err.name} - ${err.message}`});
    }

    await dbMan
        .updateDocument(config.MONGO_COL_TEAMS, {id: team.id}, team)
        .then((result) => {
            log.debug(__filename, `updateTeam(${team.id})`, 'Team updated.');
            res.status(200).json(result);
        })
        .catch((err) => {
            log.error(__filename, `updateTeam(${team.id})`, 'Error updating team ->', err);
            res.status(500).json({status: '500', message: `${err.name} - ${err.message}`});
        });
};

/**
 * Remove the team document with the ID found in req.id and sends result/count as json response
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let deleteTeam = async (req: express.Request, res: express.Response) => {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let query: any = {id: req.params.teamId};

    await dbMan
        .deleteDocument(config.MONGO_COL_TEAMS, query)
        .then((result) => {
            log.debug(__filename, req.url, `${result.deletedCount} team(s) deleted.`);
            res.status(200).json(result);
        })
        .catch((err) => {
            log.error(__filename, req.url, 'Error deleting team ->', err);
            res.status(500).json({status: '500', message: `${err.name} - ${err.message}`});
        });
};

/**
 * Responds with the raw JSON service document unless the "?html"
 * parameter is found, in which case it renderse an HTML document
 * @param req
 * @param res
 */
let getServiceDoc = (req: express.Request, res: express.Response) => {
    log.debug(__filename, `Route -> [${req.url}]`, 'Handling request.');
    res.status(200).json(config.SERVICE_DOC);
};

/**
 * Handles undefined routes
 */
let unhandledRoute = (req: express.Request, res: express.Response) => {
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
function getSvcDocUrl(req: express.Request): string {
    let svcData: Service = config.SERVICE_DOC;
    let ep = svcData.getEndpointByName('service');
    return `${getProtocolHostPort(req)}${svcData.BaseUrl}${ep.Url}`;
}

/**
 * Reconstruct the URL from the Express Request object
 * @param req
 */
function rebuildUrl(req: express.Request): string {
    let svcData: Service = config.SERVICE_DOC;
    return `${getProtocolHostPort(req)}${svcData.BaseUrl}${req.path}`;
}

/**
 * Get and return the protocol, host, and port for the current
 * request.
 *
 * @param req
 */
function getProtocolHostPort(req: express.Request): string {
    return `${req.protocol}://${req.get('host')}`;
}

// Route -> http.get mappings
defaultRouter.get('/get/count', getTeamCount);
defaultRouter.get('/get', getTeams);
defaultRouter.get('/service', getServiceDoc);

// Route -> http.put mappings
defaultRouter.put('/insert', insertTeam);
defaultRouter.put('/update', updateTeam);

// Route -> http.delete mappings
defaultRouter.delete('/delete/:teamId', deleteTeam);

// capture all unhandled routes
defaultRouter.get('/*', unhandledRoute);
defaultRouter.put('/*', unhandledRoute);
defaultRouter.delete('/*', unhandledRoute);
defaultRouter.post('/*', unhandledRoute);

// expose router as module
export default defaultRouter;
