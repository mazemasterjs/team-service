# team-service

team-service handles storage and retrieval of team-related data for MazeMasterJS.

## Details

-   MazeMasterJS services are RESTful APIs built in NodeJS with express
-   Every service includes a service.json file that lists endpoints, and possible arguments (with type)
-   See [/service.json](https://github.com/mazemasterjs/team-service/blob/development/service.json) for complete list of endpoints and arguments.

## Notes

-   This service is hooked to OpenShift - when a PR against master is completed, the CD pipeline kicks in and OpenShift pulls the repo, creates a new container image, and attempts to deploy it to the cluster. Unless the build / deploy fails, changes will be live within a minute of the PR being completed.

## Change Log

### v1.0.0

-   get: '/get/count' - Returns count of all team documents
-   get: '/get' - gets all teams in database (paging enabled internally - could take awhile - use with caution!)
-   get: '/service' - returns the service document
-   put: '/insert' - Insert a team into the database (team passed as json document body)
-   put: '/update' - Update a team in the database (updated team passed as json document body)
-   delete: '/delete/:teamId - Delete a single team with a matching teamId
