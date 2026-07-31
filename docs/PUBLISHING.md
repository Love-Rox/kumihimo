# Publishing the VS Code extension

The pipeline in `.github/workflows/publish-vscode.yml` runs when the version in
`packages/vscode/package.json` changes on `main`. It always builds the `.vsix` and attaches
it to a GitHub release. Whether it also reaches the Marketplace depends on what is
configured.

There are two ways in, tried in this order:

|                        | Stores a secret? | Expires                                            |
| ---------------------- | ---------------- | -------------------------------------------------- |
| **Entra ID over OIDC** | No               | Never — tokens last an hour and are minted per run |
| Personal Access Token  | `VSCE_PAT`       | Yes, and silently                                  |

Prefer the first. A publisher PAT has to be minted inside an Azure DevOps organisation,
expires on a date nobody remembers, and takes the pipeline down when it does.

---

## Entra ID over OIDC

GitHub mints a token for the run, Entra ID exchanges it for a short-lived one, and `vsce`
picks that up through the signed-in Azure CLI. Nothing long-lived is stored anywhere.

Requires `vsce >= 2.26.1`. This repository is on 3.9.2.

### 1. An identity in Entra ID

In the Azure portal, **Microsoft Entra ID → App registrations → New registration**. Any
name; single tenant is fine. It needs no redirect URI and no client secret — a secret is
exactly what this is avoiding.

Note the **Application (client) ID** and **Directory (tenant) ID**.

### 2. A federated credential for this repository

On that registration, **Certificates & secrets → Federated credentials → Add credential**,
scenario **GitHub Actions deploying Azure resources**:

|              |            |
| ------------ | ---------- |
| Organization | `Love-Rox` |
| Repository   | `kumihimo` |
| Entity type  | **Branch** |
| Branch       | `main`     |

This is the whole trust relationship: Entra ID will accept a token only from a run of this
workflow, on this branch, in this repository.

> The workflow can also be run by hand (`workflow_dispatch`). That still runs on `main`, so
> one credential covers both.

### 3. Let it publish as the publisher

The identity has to be a member of the `love-rox` publisher, or it can authenticate and
still do nothing.

At <https://marketplace.visualstudio.com/manage/publishers/love-rox>, under **Members**,
add the service principal and give it a role that can publish.

> This step is the one that varies with what Microsoft's UI is doing this month, and it is
> also the one that cannot be checked from here. If the run authenticates but the publish
> is refused, this is where to look.

### 4. Three repository variables

**Variables**, not secrets. They are identifiers, and keeping them readable makes a failed
run readable too.

Settings → Secrets and variables → Actions → **Variables**:

```
AZURE_CLIENT_ID        the Application (client) ID from step 1
AZURE_TENANT_ID        the Directory (tenant) ID from step 1
AZURE_SUBSCRIPTION_ID  any subscription in that tenant
```

`azure/login` insists on a subscription even though publishing does not touch one.

### 5. Check it

Run **Publish VS Code extension** by hand from the Actions tab. It publishes whatever
version is in the manifest, so a run that changes nothing is a safe test: publishing a
version that is already live fails loudly rather than doing something surprising.

---

## Personal Access Token

The fallback. Set `VSCE_PAT` as a repository **secret**, from a PAT with the
**Marketplace → Manage** scope, minted in an Azure DevOps organisation on the same account
as the publisher.

Used only when the Entra ID variables are unset.

---

## Open VSX

VSCodium, Cursor and the rest install from Open VSX rather than the Marketplace. Set
`OVSX_PAT` as a repository secret to publish there too. There is no OIDC path for it.

Skipped silently when unset — the Marketplace is the release, and this is the same bytes
reaching a second shop.

---

## When nothing is configured

The `.vsix` is attached to a GitHub release, which is where the extension is actually
obtainable in the meantime:

```sh
gh release download 'kumihimo-vscode@0.4.3' -R Love-Rox/kumihimo -p '*.vsix'
```

Then upload it at
<https://marketplace.visualstudio.com/manage/publishers/love-rox>.
