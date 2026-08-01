# Publishing the VS Code extension

The pipeline in `.github/workflows/publish-vscode.yml` runs when the version in
`packages/vscode/package.json` changes on `main`. It always builds the `.vsix` and attaches
it to a GitHub release. Whether it also reaches the Marketplace depends on what is
configured.

There are two ways in, tried in this order:

|                        | Stores a secret? | Needs rights in the tenant | Expires           |
| ---------------------- | ---------------- | -------------------------- | ----------------- |
| **Entra ID over OIDC** | No               | Yes                        | Never — per run   |
| Personal Access Token  | `VSCE_PAT`       | No                         | Yes, up to a year |

Neither is going away. Microsoft discourages PATs and recommends Entra ID, and has
announced no date on which PATs stop working.

Pick by which obstacle is smaller. Registering an application needs rights in the Entra
tenant, which not everyone has; a PAT needs none, at the cost of a date in the calendar. An
expired PAT fails the run loudly, and Azure DevOps emails a warning before it happens.

---

## Entra ID over OIDC

> **Entra ID** is Microsoft's identity service — the part that holds accounts and decides
> who may do what. It was called Azure Active Directory until 2023, and it is separate from
> the parts of Azure that cost money. You are already using it: the Microsoft account that
> owns the `love-rox` publisher is an identity in it.
>
> Creating an identity, giving it a federated credential and making it a publisher member
> are all on the **Free** tier, which comes with any Microsoft account. The paid tiers (P1,
> P2) buy conditional access and the like, and none of it is needed here.
>
> What follows creates a _non-human_ identity, says that only runs of this workflow may
> speak as it, and makes it a member of the publisher. There is no password and no token
> anywhere — the fact that a run came from `Love-Rox/kumihimo` on `main` **is** the key.

GitHub mints a token for the run, Entra ID exchanges it for a short-lived one, and `vsce`
picks that up through the signed-in Azure CLI. Nothing long-lived is stored anywhere.

**No Azure subscription is needed.** Publishing touches no Azure resource, and the workflow
signs in with `allow-no-subscriptions`.

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

### 4. A second federated credential, for the environment

The publish job runs in the `marketplace` environment, and GitHub names the environment
rather than the branch in the subject of a token for such a job. One credential does not
cover both, so add a second with the same organization and repository but:

|             |                 |
| ----------- | --------------- |
| Entity type | **Environment** |
| Environment | `marketplace`   |

The branch credential is still needed by the one-off in step 6.

### 4. Two repository variables

**Variables**, not secrets. They are identifiers, and keeping them readable makes a failed
run readable too.

Settings → Secrets and variables → Actions → **Variables**:

```
AZURE_CLIENT_ID  the Application (client) ID from step 1
AZURE_TENANT_ID  the Directory (tenant) ID from step 1
```

### 5. Give the identity an Azure DevOps profile

The Marketplace's member box wants an Azure DevOps _profile_ id — not the application id
and not the service principal's object id. Both of those give
`TF14045: The identity could not be found`.

A service principal has no profile until it is a **user of an Azure DevOps organization**;
it cannot sign in interactively, so it never materialises on its own. So:

1. Create an organisation at <https://dev.azure.com> if there is none. It is free, and
   needs no project.
2. Connect it to the tenant: **Organization Settings → Microsoft Entra → Connect
   directory**. A service principal can only be added to an organisation connected to the
   tenant it lives in — without this, the Add users box reads the name as an email address
   and rejects it.
3. **Organization Settings → Users → Add users**, the identity's display name, access
   level **Basic**.

Then read its profile id with a workflow that signs in as the identity and asks Azure
DevOps who it is:

```sh
az rest --url https://app.vssps.visualstudio.com/_apis/profile/profiles/me \
  --resource 499b84ac-1321-427f-aa17-267ca6975798
```

The `id` in the response is what goes in the Marketplace member box, with the
**Contributor** role. There is no secret to run this with locally, which is the point: the
branch federated credential lets a run of this repository do it. `entra-profile-id.yml` in
this repository's history is that workflow.

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

## The Obsidian plugin

Obsidian's community directory takes a **repository URL** and reads `manifest.json` from the
root of that repository's default branch. A monorepo cannot answer that, so the plugin is
mirrored: developed here under `packages/obsidian`, beside the compiler it uses, and pushed
to a repository shaped the way the directory expects.

`publish-obsidian.yml` does it on every release, the same way the VS Code extension goes to
the Marketplace. What it needs:

### 1. The mirror repository

Create **`Love-Rox/obsidian-kumihimo`**, public, empty — no README, no licence, no
`.gitignore`. The workflow force-pushes over it, so anything committed there by hand is
overwritten on the next release.

### 2. A token that can write to it

The default `GITHUB_TOKEN` reaches only this repository, so a token for the other one is
required. A fine-grained personal access token:

- **Repository access** — only `Love-Rox/obsidian-kumihimo`
- **Permissions** — Contents: _Read and write_
- **Expiry** — whatever you are willing to rotate. The workflow fails loudly when it lapses
  rather than publishing half of a release.

Set it as a secret on **this** repository, in your own terminal so the value never travels
through anything else:

```sh
gh secret set OBSIDIAN_REPO_TOKEN --repo Love-Rox/kumihimo
```

### 3. Submitting it, once

Only the first version goes through the directory; after that Obsidian takes new releases
from GitHub by itself.

1. Let a release run, so the mirror has `manifest.json` at its root and a GitHub release
   whose **tag is exactly the version** — no `v` prefix. Obsidian looks for that tag by
   name when somebody installs the plugin.
2. Sign in at [community.obsidian.md](https://community.obsidian.md) with an Obsidian
   account and link the GitHub account that owns the repository.
3. **Plugins → New plugin**, give the repository URL, agree to the developer policies.
4. An automated review runs and shows what needs correcting. To answer it, fix the source
   **here**, and release again — the mirror is generated, so editing it directly is undone.

### What the review checks, and where each answer lives

|                                                                         |                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `README.md`, `LICENSE`, `manifest.json` at the root                     | `packages/obsidian/`, copied by the workflow                                                                     |
| `id` unique, and not containing "obsidian"                              | `kumihimo`                                                                                                       |
| Description ≤ 250 characters, ends with a period, no special characters | `manifest.json`                                                                                                  |
| `minAppVersion` set to something real                                   | `manifest.json`                                                                                                  |
| `isDesktopOnly` true if Node or Electron APIs are used                  | false, and it is true that none are — the layout engine builds no worker and runs with `Worker` deleted outright |
| No `fundingUrl` unless donations are actually accepted                  | absent                                                                                                           |
| No leftover sample code                                                 | none: this was not made from the template                                                                        |
