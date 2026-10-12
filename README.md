# VP Construction Jarves AI

Standalone Node.js + PostgreSQL starter for the VP Construction command centre.

The initial source bundle is stored as `jarves-source.zip.b64` and can be extracted during deployment with:

```sh
base64 -d jarves-source.zip.b64 > jarves-source.zip
unzip -o jarves-source.zip
cd vp-jarves-ai && npm install
```

**Security:** this repository is currently public. Do not commit real API keys, passwords, production connection strings, client information, or financial records. Make the repository private in GitHub settings before commercial use.

Source is a starter scaffold; production configuration, managed database, auth hardening and end-to-end tests are still required.