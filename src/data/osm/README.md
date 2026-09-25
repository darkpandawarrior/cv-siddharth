# src/data/osm

`mutha.json` holds the real course of the Mutha river through Pune, baked at
build time from OpenStreetMap by `scripts/gen-river-osm.mjs` (`npm run
gen:river`, manual, never run by the build). It never changes on its own; a
fresh run only overwrites it when a mirror actually answers.

Contains data © OpenStreetMap contributors, available under the [Open
Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1.0/).
Because this file is redistributed in a public repository, it is itself an
ODbL database and is offered onward under the same licence (the share-alike
obligation applies to this file only, not to the surrounding app code).

Shape only: the drawn river's course is Pune's, but distance along it carries
no meaning in the world it feeds (world-v2's z axis is time, not river-km).
