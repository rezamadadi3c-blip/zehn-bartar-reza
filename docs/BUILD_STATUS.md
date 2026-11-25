# Android build status

The repository includes a GitHub Actions workflow at `.github/workflows/build-apk.yml` that builds a debug APK with `assembleDebug` and uploads it as the `zehn-bartar-reza-debug-apk` artifact for 14 days.

A debug APK is suitable for testing and does not require the owner's private release keystore. A distributable release APK must be signed with a private keystore. The keystore and its passwords must remain under the owner's control and must be stored only as encrypted GitHub Actions secrets; never commit them to this repository or send them in chat.

Current limitation: this repository change can trigger the debug build, but it does not create or sign a release APK.