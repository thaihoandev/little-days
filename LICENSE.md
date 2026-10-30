# Little Days licensing

Copyright (c) 2026 thaihoandev and the Little Days contributors.

Except where a file identifies a different license or copyright holder, the original Little Days code, bundled procedural music, original SVG illustrations/decorations, and original scrapbook templates are licensed under the **GNU Affero General Public License, version 3 only (AGPL-3.0-only)**, with the additional permission in [LICENSE-REMOTION-EXCEPTION.md](LICENSE-REMOTION-EXCEPTION.md).

The complete, unmodified AGPL text is in [LICENSE](LICENSE). The Remotion exception was approved by the project owner. It permits linking the covered Little Days code with Remotion for preview/rendering; it does not relicense Remotion, grant a Remotion Company License, or remove third-party requirements. Corresponding-source obligations for covered Little Days modifications remain in force.

Third-party dependencies, fonts and native binaries keep their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), the generated dependency inventory, and [licenses/](licenses/). These notices are not a claim that every redistribution, commercial use, codec or deployment arrangement has received legal clearance.

## Source availability

The web interface offers source and license links. Builds generate an exact-commit source/archive URL when the Git working tree is clean. In a checkout without Git metadata, the build can use the public `RENDER_GIT_COMMIT` or `VERCEL_GIT_COMMIT_SHA` supplied by the deployment provider. The Dockerfile accepts Render's automatic commit build argument; no secret or new environment file is needed. Modified deployments must publish their complete Corresponding Source, including build/install scripts and their modifications, and update `repository.url` in `package.json` to the repository that actually contains their deployed version before building. Do not point modified deployments to an unchanged upstream repository.

An unknown/dirty source revision is marked as a development build; do not treat that fallback as an exact-version source offer for a public modified deployment. Keep the repository/archive accessible to remote users. Never include `.env`, credentials, private uploads, database dumps or personal data in a public source archive.

## User content

This software license does not automatically license, publish or transfer ownership of users' uploaded photos, private text, personal data or user-provided music. Users and operators must have the necessary rights for content they supply. Software licensing does not change the application's authentication and sharing rules.

No warranty is provided, except as required by applicable law or separately agreed in writing. Consult the complete license for the legally operative terms.

## Contributions

Contributions to covered Little Days files are accepted under AGPL-3.0-only with the same Remotion additional permission, unless explicitly agreed otherwise before contribution. Contributors retain their own copyright. Do not submit material you cannot license under those terms.
