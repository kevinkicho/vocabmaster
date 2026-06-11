#!/bin/bash
# Improved runtime test script for emulator.
# Uses temp captures in /tmp, then agent can read and rename to screenshots/runtime-tests/ with names matching content.
# Has retry for Start tap by trying a range of y coords.

set -e

export ANDROID_HOME=~/android-sdk
export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH

PROJECT_ROOT=$(pwd)
SCREEN_DIR=$PROJECT_ROOT/screenshots/runtime-tests
mkdir -p $SCREEN_DIR
TMP_DIR=/tmp/vocab_tests
mkdir -p $TMP_DIR

echo "=== Launch app ==="
adb shell am force-stop com.vocabmaster.app || true
adb shell am start -n com.vocabmaster.app/.MainActivity
sleep 5

echo "=== Capture splash ==="
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png $TMP_DIR/00_splash.png
cp $TMP_DIR/00_splash.png $SCREEN_DIR/00_splash_start.png
echo "VISUAL_CHECK: $SCREEN_DIR/00_splash_start.png"

echo "=== Trying to tap Start with range of y to find menu ==="
for y in 800 825 850 875 900 925 950; do
  echo "Trying tap Start at y=$y"
  adb shell input tap 360 $y
  sleep 4
  adb shell screencap -p /sdcard/screen.png
  adb pull /sdcard/screen.png $TMP_DIR/tap_start_y$y.png
  cp $TMP_DIR/tap_start_y$y.png $SCREEN_DIR/01_tap_start_y$y.png
  echo "VISUAL_CHECK: $SCREEN_DIR/01_tap_start_y$y.png"
done

echo "=== Assuming one of the above is menu, tap for Story (AI section lower) ==="
adb shell input tap 120 620
sleep 5
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png $TMP_DIR/story.png
cp $TMP_DIR/story.png $SCREEN_DIR/02_story_tap.png
echo "VISUAL_CHECK: $SCREEN_DIR/02_story_tap.png"

echo "=== Tap for AI Cloze ==="
adb shell input tap 120 720
sleep 5
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png $TMP_DIR/ai_cloze.png
cp $TMP_DIR/ai_cloze.png $SCREEN_DIR/03_ai_cloze_tap.png
echo "VISUAL_CHECK: $SCREEN_DIR/03_ai_cloze_tap.png"

echo "=== Tap gear for settings ==="
adb shell input tap 650 80
sleep 5
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png $TMP_DIR/settings.png
cp $TMP_DIR/settings.png $SCREEN_DIR/04_settings_modal.png
echo "VISUAL_CHECK: $SCREEN_DIR/04_settings_modal.png"

echo "=== Check logs for AI mandatory ==="
adb logcat -d | grep -E 'LLM|Story|AI Required|No models available' | tail -20

echo "Done. Review the VISUAL_CHECK files with read_file to see actual content and rename if needed in the script for future. The names are now step-based, but we can post-process based on reads."
