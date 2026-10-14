# DOOM Eternal Sharper

A sharpness and anti-aliasing tweak pack for DOOM Eternal on PC.

The default image is soft because the game forces its own temporal anti-aliasing (TAA), keeps the sharpening slider low, and layers chromatic aberration and film grain on top. This pack fixes that in two layers:

1. **Engine-level (no injector, no extra software).** In-game settings, the game's own console variables, a launch option, and driver features (DLAA, supersampling, driver sharpening). This is the main mod and it is safe for Battlemode.
2. **Optional ReShade preset.** Only if you want real SMAA edge smoothing with the game's TAA off, or want more sharpening than the engine gives you. Skip this if you don't want an injector.

Pick one of the two profiles below, then add the anti-aliasing upgrade that matches your GPU.

---

## Profile A: Clean TAA (recommended for most people)

Keeps the game's TAA, so no shimmer or jaggies, and removes the blur it causes. Takes two minutes and nothing is installed.

In **Settings → Video**:

| Setting | Value | Why |
| --- | --- | --- |
| Resolution Scaling Mode | **Off** (or Static at 100%) | Dynamic scaling silently drops render resolution, which is the single biggest source of blur. |
| Sharpening | **50–70** (default is 20–33 depending on preset) | Undoes TAA softening. Above 70 you start to see halos on edges. |
| Chromatic Aberration | **Off** | Adds colour fringing on every high-contrast edge. |
| Film Grain | **0** | Noise reads as blur, and it defeats sharpening. |
| Motion Blur | **Off** | Personal taste, but it smears detail during the fast movement this game is built around. |
| DLSS Sharpening (NVIDIA, only when DLSS is on) | **30–50** | Separate slider from the one above. Start at 40. |

That is the whole of Profile A. If you want more, continue with **Better anti-aliasing** below.

## Profile B: Raw (sharpest, some jaggies)

Turns the forced TAA off entirely. Textures and distant detail become noticeably crisper, but you get aliasing on thin geometry and specular shimmer, especially at 1080p. Best at 1440p and up, or combined with supersampling or the ReShade SMAA preset.

1. Apply the Profile A settings, but set **Sharpening to 15–25**. With TAA gone there is far less blur to undo, and high sharpening will look crunchy.
2. Add this to the game's launch options (Steam: right-click DOOM Eternal → Properties → General → Launch Options):

   ```
   +r_antialiasing 0
   ```

   The full line, with an optional intro-skip, is in `launch-options.txt`.

3. To preview before committing, open the console in-game with the **tilde key** (`~`, left of `1`) and type `r_antialiasing 0`. It applies instantly. `r_antialiasing 1` turns TAA back on. Console changes are not saved between sessions, which is why the launch option exists. The command list is in `sharper.cfg`.

Values other than 0 and 1 are not documented, so stick to those.

---

## Better anti-aliasing (no injector)

Sharpening recovers detail. It does not add anti-aliasing. These do, and none of them touch the game files.

### NVIDIA RTX: DLAA through the DLSS override (best option)

DOOM Eternal is on NVIDIA's DLSS override list, which lets you force **DLAA** (DLSS running at native resolution, no upscaling) with the newer transformer model. It is a large quality jump over the game's TAA, with no shimmer and far less blur. Requires GeForce driver 572.16 or newer and NVIDIA app 11.0.2.312 or newer.

1. In the game, enable **DLSS** at any quality level, then quit to desktop. The override only applies to games that have DLSS turned on.
2. Open the **NVIDIA app → Graphics → DOOM Eternal** (Program Settings).
3. Under Driver Settings, set **DLSS Override – Super Resolution** to **DLAA**, and **DLSS Override – Model Presets** to **Latest** (the transformer model).
4. Launch the game. Keep Profile A settings, but lower in-game **Sharpening to 20–35** and use the **DLSS Sharpening** slider instead. The transformer model is already sharper than TAA.

DLAA costs roughly the same frame time as native TAA plus a little, so if you were leaning on DLSS Quality for performance, use **Quality** with the Latest model preset instead of DLAA. It still beats the stock image.

### Any GPU: supersampling (DSR / VSR)

Render above your monitor's resolution and let the driver downscale. This is the cleanest anti-aliasing there is, and it works with or without the game's TAA. It is expensive: 2.25x DSR on a 1440p screen is a 4K render.

- **NVIDIA**: NVIDIA Control Panel → Manage 3D Settings → Global → **DSR – Factors**: tick **2.25x** (or 1.78x on weaker cards). RTX cards get **DL** factors, which look better than legacy ones. Set **DSR – Smoothness** to 0–15%. Then pick the new higher resolution inside the game.
- **AMD**: AMD Software → Gaming → Display → **Virtual Super Resolution: On**. Then pick the new higher resolution inside the game.

Keep Resolution Scaling Mode **Off** in-game or it will quietly undo the supersampling.

### Any GPU: driver sharpening instead of the in-game slider

If you prefer the driver's sharpening filter, both vendors' versions work on Vulkan, which DOOM Eternal uses. Use one source of sharpening, not two.

- **NVIDIA**: NVIDIA Control Panel → Manage 3D Settings → Program Settings → DOOM Eternal → **Image Sharpening: On**, Sharpen 0.50, Ignore film grain 0.17. On recent drivers the global version is called **Image Scaling**: turning it on at your native resolution applies only the sharpening part.
- **AMD**: AMD Software → Gaming → DOOM Eternal → **Radeon Image Sharpening: On**, Sharpness 60–80%.

Set the in-game Sharpening slider to 0–10 when using these.

---

## Linux and Steam Deck: vkBasalt (Vulkan layer, not ReShade)

vkBasalt is a native Vulkan post-processing layer with built-in CAS sharpening and SMAA/FXAA. It is in most distro repos (`apt install vkbasalt`, `dnf install vkBasalt`, `pacman -S vkbasalt`) and ships on many Steam Deck setups through Flatpak/Decky plugins.

1. Install vkBasalt.
2. Copy `linux/vkBasalt.conf` to `~/.config/vkBasalt/vkBasalt.conf`.
3. Steam launch options for DOOM Eternal:

   ```
   ENABLE_VKBASALT=1 %command%
   ```

   To also turn TAA off: `ENABLE_VKBASALT=1 %command% +r_antialiasing 0`

4. **Home** toggles the effects in-game (X11/XWayland only).

The included config defaults to CAS sharpening at 0.45 for use with the game's TAA. Uncomment the `smaa:cas` line if you turned TAA off and want edge smoothing back.

The game's config file under Proton lives at
`~/.steam/steam/steamapps/compatdata/782330/pfx/drive_c/users/steamuser/Saved Games/id Software/DOOMEternal/base/DOOMEternalConfig.local`.

---

## Optional: ReShade preset (Windows)

Use this only if you want SMAA with the game's TAA off (Profile B) and your GPU has no DLAA, or you want contrast-adaptive sharpening that is cleaner than the in-game slider. ReShade is a post-process injector. DOOM Eternal removed Denuvo Anti-Cheat in May 2020 and ReShade is widely used with it, but it is still third-party software hooking the game, so it is your call for Battlemode.

Two presets are in `reshade/`:

| Preset | Use with | What it does |
| --- | --- | --- |
| `DoomEternal_Sharp.ini` | Profile A (TAA on) | AMD FidelityFX CAS sharpening at 0.6. Set the in-game Sharpening slider to 0–10. |
| `DoomEternal_SharpSMAA.ini` | Profile B (TAA off) | SMAA (colour edge detection, high search steps) for edges, then CAS at 0.45. |

### Install

1. Download ReShade from reshade.me and run the setup.
2. Browse to the game executable: `...\steamapps\common\DOOMEternal\DOOMEternalx64vk.exe`. Select the **Vulkan** API. (ReShade registers Vulkan as a system-wide layer; that is normal and it is inactive in games you did not select.)
3. When asked which effect packages to install, keep **Standard effects** ticked. It contains `CAS.fx` and `SMAA.fx`, which the presets need. Finish the installer.
4. Copy the `.ini` file(s) from `reshade/` into the game folder next to `DOOMEternalx64vk.exe`.
5. Launch the game, press **Home** to open the ReShade overlay, and pick the preset from the dropdown at the top. Press Home again to close it.

If a technique shows unticked after loading the preset, tick `ContrastAdaptiveSharpen` (and `SMAA` for the second preset) in the overlay list and the preset will remember it.

### Known issue: the game disables the ReShade layer

A 2024 DOOM Eternal update began setting the environment variable that tells Vulkan to skip ReShade's layer, so the overlay never appears. The workaround reported on the ReShade forum is to open `C:\ProgramData\ReShade\ReShade64.json` in a text editor and rename the `DISABLE_VK_LAYER_reshade_1` key (for example to `DISABLE_VK_LAYER_reshade_1_off`). Save, relaunch. Repeat if a ReShade update rewrites the file.

---

## Files

| File | Purpose |
| --- | --- |
| `sharper.cfg` | The console commands, with comments. Paste lines into the in-game console (`~`). |
| `launch-options.txt` | The launch-option line that makes the console settings stick. |
| `linux/vkBasalt.conf` | Ready-made vkBasalt config (CAS, optional SMAA) for Linux and Steam Deck. |
| `reshade/DoomEternal_Sharp.ini` | Optional ReShade preset: CAS only, for TAA on. |
| `reshade/DoomEternal_SharpSMAA.ini` | Optional ReShade preset: SMAA + CAS, for TAA off. |

## Config file (if you prefer editing it)

Windows: `%USERPROFILE%\Saved Games\id Software\DOOMEternal\base\DOOMEternalConfig.local`. It is a plain text list of `cvar "value"` lines holding the Video menu settings. Back it up before editing. Note that players report `r_antialiasing` stopped being read from this file after a later update, which is why this pack uses the launch option instead.

## Uninstall

- Remove the launch options line.
- Set the Video menu back to taste. Nothing in the game folder was changed by Profiles A or B.
- ReShade: run the ReShade setup again, pick the game, and choose **Uninstall**, then delete the `.ini` presets from the game folder.
- vkBasalt: remove `ENABLE_VKBASALT=1` from the launch options.

## Notes on what was and wasn't verified

- The file path, Steam app ID, `r_antialiasing` values 0 and 1, the `+r_antialiasing 0` launch option, the tilde console key, the NVIDIA DLSS override support for this game, and the ReShade layer workaround all come from community guides and vendor posts; none could be tested from here.
- The in-game Sharpening slider is controlled through the menu because the engine's cvar name for it could not be confirmed. If you find it in `DOOMEternalConfig.local`, it can be raised past the menu's range there.
- ReShade preset keys use the uniform names from the standard `CAS.fx` and `SMAA.fx`. ReShade ignores any key it does not recognise and falls back to the shader default, so a mismatch degrades gracefully rather than breaking.
