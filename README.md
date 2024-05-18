## In a galaxy of coding capers... When BetterDiscord and Vencord dared to merge...
## Behold... BetterVencord!
![image](https://github.com/Davilarek/Vencord/assets/62715937/7126afa2-6086-4675-9427-e3f0cf542651)

A Forceful Blend of Discord Awesomeness! 🌌🚀🤖

## Note for plugin devs
Don't fork this repo to make plugins for Vencord.
We will pull changes from upstream, so if you want to make a plugin for Vencord but have it in BV, just wait for us to pull from upstream.

## Features

-   Super easy to install (Download Installer, open, click install button, done)
-   100+ plugins built in: [See a list](https://vencord.dev/plugins)
    -   Some highlights: SpotifyControls, MessageLogger, Experiments, GameActivityToggle, Translate, NoTrack, QuickReply, Free Emotes/Stickers, PermissionsViewer, CustomCommands, ShowHiddenChannels, PronounDB
-   Fairly lightweight despite the many inbuilt plugins
-   Excellent Browser Support: Run Vencord in your Browser via extension or UserScript
-   Works on any Discord branch: Stable, Canary or PTB all work (though for the best experience I recommend stable!)
-   Custom CSS and Themes: Inbuilt css editor with support to import any css files (including BetterDiscord themes)
-   Privacy friendly, blocks Discord analytics & crash reporting out of the box and has no telemetry
-   Maintained very actively, broken plugins are usually fixed within 12 hours
-   Settings sync: Keep your plugins and their settings synchronised between devices / apps (optional)
-   BdApi Compatibility : Allows (most) BetterDiscord plugins to be ran as if it was normal BetterDiscord!

***
> [!NOTE]
> External Sources were used.
> - BrowserFS: https://github.com/jvilk/BrowserFS
> - Some of BetterDiscord's code: https://github.com/Davilarek/Vencord/blob/main/src/plugins/bdCompatLayer/stuffFromBD.js

> "it's called Vencord because it's made by ven,<br>
> it's called BetterVencord because it's bettter than Vencord"<br>
> \- Davilarek

## Installation Instructions (officially as per upstream)

1. **Install VencordInstaller:**
   - For PC start by installing [VencordInstaller](https://vencord.dev/download/) depending on your OS. Follow the on-screen instructions to complete the installation.

   - If you do NOT know what `pnpm` is. Please run `pnpmInstall.sh`, or if you DO NOT have it installed, Do the same thing !!!

2. **BetterVencord Installation:**
   - For PC Installation:<br>
     a. Run `install.bat`.<br>
     b. Run `build.bat`.

   - For Web Installation:<br>
     a. Run `install.bat`.<br>
     b. Run `buildWeb.bat`.<br>
     c. Install like a normal extension

3. **Finalize Installation:**
   - Run `automaticInstallDist.bat` and type `a`.
   - After the build process is complete, the software should be ready to use.

## Installation instructions (unofficially and primarily for Linux)
### Compiling source
[BetterVencord](https://github.com/Davilarek/Vencord) needs to be compiled. The following below are build instructions for [Linux](https://github.com/Vendicated/Vencord/blob/main/.github/workflows/build.yml):
```
git clone https://github.com/Davilarek/Vencord.git
cd Vencord
pnpm install --frozen-lockfile
pnpm build
```

```
pnpm buildWeb
```
Could be optionally run if you intend to use BetterVencord on the web, like ArmCord, or Discord in a browser. 

After compile has finished, the resulting files in `dist` is required to be left intact, in order to maintain BetterVencord functionality. The rest of the source could be optionally removed. Should you wish to keep the source, you could for instance, set it up to have partial update functionality (see `Updating` section below), and/or for implementing other third party Vencord plugins

### Troubleshooting
If for whatever reason you are an error during `pnpm install` e.g.
```
pnpm install
 ERR_PNPM_BAD_PM_VERSION  This project is configured to use v8.10.2 of pnpm. Your current pnpm is v9.1.0

If you want to bypass this version check, you can set the "package-manager-strict" configuration to "false" or set the "COREPACK_ENABLE_STRICT" environment variable to "0"
```

This is set by `package.json`

You have few options:
* export the variable `COREPACK_ENABLE_STRICT=0` via either `export COREPACK_ENABLE_STRICT=0` or `set COREPACK_ENABLE_STRICT=0`,
* (less ideal), downgrade/install the older, required version, 8.10.2 and retry running `pnpm install` again.
* (not recommended) edit `package.json` so that it correctly matches your installed `pnpm` version, and retry running `pnpm install` again.

### Installing
Run [VenCord's official installer](https://github.com/Vendicated/Vencord#installing--uninstalling) first. If your discord installation path includes files or directories that are not owned by you, or that you are not a member of, or you have no write access to, ensure that you run the installer as a privileged account. Vencord needs to patch `app.asar`.

Once done,
1. Backup your Vencord user data first. On Linux for example is defined by [`XDG_CONFIG_HOME`](https://github.com/Vencord/Installer/blob/main/install.sh), as `$HOME/.config/Vencord/`, on Windows, try checking `%appdata%/Vencord`.
2. Copy your the contents of your compiled BetterVencord's `dist` directory/folder into own Vencord user data.

## Installing on Browser
Needs building manually too. These are incompatible with desktop app variant, as it generates a standalone variant that doesn't have the ability to check for updates, for a forked build that does not have releases.
```
pnpm buildWeb --standalone
pnpm build --standalone
```

## Using
Once installed, BetterVencord functions similar to Vencord but with BD Compatibility Layer under Plugins. This needs to be enabled first before you can add [BetterDiscord](https://betterdiscord.app/) plugin(s). A successful enabling of BD Compatibility Layer will show up an extra menu entry (on the left of discord UI) as Virtual Filesystem, under Backup & Restore. To then add BetterDiscord plugins, in Virtual Filesystem, left click on `/`, then `BD`, then right click on `plugins`, and click on Import a file here.

### Importing BD plugins
#### First BD plugin import
BetterVencord will not function properly if BD plugins are missing [ZeresPluginLibrary](https://github.com/rauenzi/BDPluginLibrary), the BD Compatibility Layer does not provide this library either. You will need to click on the link download the file somewhere temporarily, then import the ZeresPluginLibrary. See the next section about adding BD plugins.

#### Subsequent importing BD plugins
Newly imported plugins will not be immediately visible. To make it visible, collapse the plugins directory/folder then expand it again. This should ideally be done to visually confirm that the BD plugin has imported into the Virtual Filesystem, prior to enabling BD plugins to be visible within Vencord's plugin list. To do that, you will need to click on Reload BD Plugins, so that these changes should take effect under Vencord → Plugins. Confirm that the BD plugin has its own entry within Vencord. If the imported BD plugin does not have its own entry within the list of Plugins, it may not be compatible with BetterVencord, and should therefore be removed.

### Removing BD plugins
To remove BD plugins from BetterVencord, navigate to plugins directory/folder as mentioned above. Right click on the BD plugin that you wish to remove, and click on Delete file. You should also visually confirm that the removed BD plugin is no longer visible via collapsing and expanding plugins directory/folder. Once that is done, make sure you hit the Reload BD Plugins button to have changes take effect.

## Uninstalling
It should be possible to uninstall BetterVencord via Vencord's official installer tool. If that fails, you will need to revert changes done to your Vencord user data path first, before running the uninstaller. If you do not have a backup for whatever reason, try deleting your Vencord user data directory or folder first, run through Vencord's official installer to install, then try uninstalling.

## Updating
BetterVencord is ineligible for updates via Vencord's official installer tool. Due to the fact that it was installed via `git`, it will require your Vencord user data (see Installing/Uninstalling section) to be set as a local git repository. See the subsequent section on initialising.

### Initialising
Setting this up should be one-off for only checking updates. Any updates discovered for BetterVencord will need to be compiled first. Do not enable automatic updates, it is not advised for non-standard Vencord installation, in which BetterVencord is presently one.

Again the instructions below are for Linux to enable update checking via patched discord UI, under user settings Vencord → Updater:
```
cd $HOME/.config/Vencord
git init
git branch -M main
git remote add origin https://github.com/Davilarek/Vencord.git
git remote set-url --push origin -- --read-only--
git fetch origin
git merge origin main
```

### Upkeeping
Any updates found upstream needs to be manually merged first, then compiled. These needs to be done everytime you noticed BetterVencord has updates. The process are as follows for manually merging:
```
cd $HOME/.config/Vencord
git fetch origin
git merge origin main
```
For Windows, substitute `$HOME/.config/Vencord` for `%appdata%/Vencord`

Manually compiling and installing are as follows:
```
pnpm install --frozen-lockfile
pnpm build
```

Once installed, changes do not take effect to a currently running discord client with BetterVencord installation. It will need to be restarted.

## Disclaimer

Discord is trademark of Discord Inc. and solely mentioned for the sake of descriptivity.
Mention of it does not imply any affiliation with or endorsement by Discord Inc.

## Read this....
For people who don't see it. Before you can *actually* use BetterVencord for the purpose of running BetterDiscord plugins on Vencord, You actually have to enable the compatibility layer for any BetterDiscord plugin to work.
***BD Compatibility Layer*** is a plugin that is ***NEEDED*** for BetterVencord to actually ***run*** BetterDiscord plugins.

<details>
<summary>Using Vencord violates Discord's terms of service</summary>

Client modifications are against Discord’s Terms of Service.

However, Discord is pretty indifferent about them and there are no known cases of users getting banned for using client mods! So you should generally be fine as long as you don’t use any plugins that implement abusive behaviour. But no worries, all inbuilt plugins are safe to use!

Regardless, if your account is very important to you and it getting disabled would be a disaster for you, you should probably not use any client mods (not exclusive to Vencord), just to be safe

Additionally, make sure not to post screenshots with Vencord in a server where you might get banned for it

</details>
