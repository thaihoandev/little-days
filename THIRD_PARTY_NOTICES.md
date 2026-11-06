# Third-party notices

Little Days' AGPL license and Remotion linking permission apply to covered project material. They do not replace any third-party license.

Run `npm run licenses:inventory` after `npm ci` to refresh `licenses/dependencies.json` from the locked dependency graph and collect available installed license/notice texts. Each entry identifies its exact locked version, declared license, whether it is installed on the audit platform, and collected notice files. Missing or custom metadata is marked for review rather than silently treated as MIT/AGPL.

## Remotion

The application currently pins Remotion packages to 4.0.440. Their metadata declares a separate Remotion license. The installed `remotion` package references `LICENSE.md` but that file is absent in the installed distribution audited here. `licenses/remotion/UPSTREAM-LICENSE.md` preserves the official upstream license fetched on 2026-10-30; it is clearly identified as a current-upstream reference, not an independently verified version-tagged license for 4.0.440.

Official references: [Remotion license](https://github.com/remotion-dev/remotion/blob/main/packages/core/LICENSE.md), [license and pricing](https://www.remotion.dev/docs/license), [license FAQ](https://www.remotion.dev/docs/license/faq). Eligibility and commercial terms remain Remotion's terms. The Little Days exception grants no additional Remotion rights. Recheck the exact version's terms before distributing or changing the usage model.

## Browser background removal

The standalone image-processing worker uses IMG.LY background-removal 1.7.0 (AGPL-3.0) and ONNX Runtime Web 1.21.0 (MIT). Original notices, the model provider's declarations and provenance distinctions are preserved in [licenses/background-removal](licenses/background-removal/README.md). The pinned IS-Net resource manifest is in `packages/background-removal/resources.json`; weights are downloaded and integrity-checked during build. The worker does not import Remotion, and Little Days' Remotion exception does not extend to these third-party components. User photographs are not licensed by these notices.

## Interactive maps

The Vietnam travel polygons are derived from geoBoundaries gbOpen VNM ADM1, boundary ID VNM-ADM1-63759600, pinned commit 9469f09, and merged into 34 groups following Vietnam's 2025 provincial reorganization. Attribute geoBoundaries / William & Mary geoLab and contributors under CC-BY-4.0; upstream metadata identifies the underlying Wikipedia geometry as Public Domain. The offline generator uses polygon-clipping (MIT). Hoang Sa and Truong Sa clusters are original schematic illustrations. See [source and transformations](docs/VIETNAM_MAP_DATA.md). Geometry remains approximate reference data, not surveyed 2025 legal boundaries.

Leaflet 1.9.4 is distributed under BSD-2-Clause; its original license is included in `licenses/THIRD-PARTY-LICENSE-TEXTS.txt`. Map data and raster tiles are supplied separately by OpenStreetMap contributors and the OpenStreetMap Foundation, with visible attribution. See the [OSM copyright and ODbL information](https://www.openstreetmap.org/copyright) and [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Tiles load when the timeline map, location picker or expanded map is displayed, with normal browser caching; bulk download and offline prefetch are not implemented. The service is best-effort and has no availability guarantee. User milestone content is not sent to a geocoding service or included in this project's code license.

## Vietnamese lunar calendar

Vietnamese lunar dates are calculated on the API with `date-chinese` 2.1.4 (`CalendarVietnamese`) and its `astronomia` dependency, distributed under MIT licenses. Original installed notices are collected in `licenses/THIRD-PARTY-LICENSE-TEXTS.txt`. No lunar-calendar or astronomy package is shipped in the frontend bundle. Holiday descriptions and icons are application data; they do not specify employer-specific leave or substitute days.

## Fonts

The product interface uses Plus Jakarta Sans, bundled locally through Fontsource 5.3.0 with Latin and Vietnamese subsets. Its original OFL-1.1 notice is preserved in `licenses/fonts/plus-jakarta-sans-OFL.txt`. This UI font does not replace the font choices saved in scrapbook documents or their video artwork.

Be Vietnam Pro, Caveat, Lora and Patrick Hand are bundled through Fontsource. Their original SIL Open Font License 1.1 notices, authors and reserved names are preserved in `licenses/fonts/`. Font licensing is independent from Little Days' code license; do not remove the font notices or rename modified fonts contrary to their reserved-name requirements.

The additional Roboto, Nunito, Quicksand, Playfair Display, Merriweather, Montserrat, Source Sans 3, Comfortaa, Dancing Script and EB Garamond families are also bundled through Fontsource with their original OFL-1.1 notices in `licenses/fonts/`. Latin and Vietnamese subsets are served locally for web and video; no Google Fonts API request is required.

## Native media and browser components

Sharp/libvips, the Remotion compositor, FFmpeg/FFprobe and downloaded Chromium include separately licensed native components. Package metadata alone is not a complete native-binary audit. Preserve their original distribution notices and the corresponding-source/relinking rights required by the actual binary builds when redistributing installers or containers. A Windows inventory does not establish the contents or obligations of the Linux image used on a server.

The repository does not commit these downloaded executables. Runtime installations and container distributions still require review of their exact bundled components. Do not describe those binaries as wholly AGPL or wholly MIT based on this project's license.

## Original project assets and external services

The daily hourglass is an original procedural model in `apps/web/src/hourglass-scene.ts`; its fallback PNG is rendered from the same model. The WebGL renderer and RoomEnvironment come from Three.js 0.187.0 (MIT). Installed dependency license texts, including Three.js and its type packages, are preserved in `licenses/THIRD-PARTY-LICENSE-TEXTS.txt`.

The original demo SVGs, vector decoration catalog and generated music are maintained in this repository; generators and design source are available with the covered project code. User-uploaded material is not included in that grant. Cloudinary, Brevo, Render, Neon and hosting services have separate service terms; a software license does not grant service accounts, quotas, trademarks or paid entitlements.
