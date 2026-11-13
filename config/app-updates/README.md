# App update settings (121)

These files tell the customer and driver apps whether a newer version exists and how strongly to ask for it. Each app
reads its own file from the media CDN at every launch: `https://media.<zone>/app-updates/<app>.json`.

```
config/app-updates/<env>/<app>.json      env = dev | prod      app = customer | driver
```

## The three levels

Each platform (`ios`, `android`) has three **build numbers**: `versionCode` in the app's `version.properties`, the
same number on iPhone and Android.

| A phone on build *b* | What it sees, before Home |
|---|---|
| *b* < `minimum` | **Update required**: a full screen; the app can't be used until updated |
| *b* < `recommended` | A sheet with **Update now** and **Later**, at **every launch** |
| *b* < `latest` | The same sheet, **once** for that `latest` |
| otherwise | nothing |

Always `minimum ≤ recommended ≤ latest`. `storeUrl` is where Update now leads. On Android, a Play install updates inside
the app, and the URL is the fallback.

## When to raise what

- **A routine release: raise `latest` only.** People hear about it once. Most releases are this.
- **An important release** (a fix people should have soon): raise `recommended` to it as well.
- **A release older builds can't live without** (a removed API field, a security fix): raise `minimum`, and only when **both** of these are true:
  - **Android**: the staged rollout in Play Console is at **100%**. Before that, Play won't give the build to some phones, and those phones would be locked out with nothing to install.
  - **iPhone**: the build is **live** in the App Store. A phased release is fine, because anyone can update by hand.
- **Phones that can't run the new build.** If the new build needs a newer iOS or Android than some phones have, raising `minimum` to it locks those phones out for good. Decide that on purpose.
- **Raise each platform separately.** iOS and Android go live at different times.
- **Lowering is allowed** (undo a mistake). It reaches phones the same way.

## Store pages

- iOS: `https://apps.apple.com/au/app/id<App Store id>` (App Store Connect › App Information › Apple ID).
- Android: `https://play.google.com/store/apps/details?id=<applicationId>`, the app's own id only.
- ⚠ The App Store id is a real-world identifier: the operator supplies it, and placeholders are refused.
- In `prod`, a store page is required as soon as any number is above 0. In `dev` it may be `null`; the screens then show no Update now, so they can be tried before the apps are in the stores.

## Publishing

```bash
# edit the file, then:
git commit -m "app updates: customer android latest → 16" config/app-updates/prod/customer.json
make app-updates ENV=prod            # validates, refuses uncommitted files, uploads, clears the CDN cache
make app-updates ENV=prod APP=driver # one app only
make app-updates-check               # validate every file, no AWS
```

Phones act on a change within about 3 minutes. Git history is the record of who changed what and when. Never edit the
S3 object by hand: it would bypass the checks and the history.
