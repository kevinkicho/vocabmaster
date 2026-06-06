# Architecture

## Overview

VocabMaster is a single-page PWA built with vanilla JavaScript (ES6+ classes), Tailwind CSS v3, and Firebase. The app runs in browser, as a PWA, or inside a native Android WebView wrapper.

## System Diagram

```
┌─────────────────────────────────────────────────┐
│                   Browser / PWA                  │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ index.html │ │ Tailwind │ │ Service Worker │  │
│  └─────┬─────┘ └──────────┘ └────────────────┘  │
│        │                                         │
│  ┌─────▼──────────────────────────────────────┐  │
│  │              main.js (App Controller)       │  │
│  │  ┌─────────┐ ┌───────┐ ┌────────────────┐  │  │
│  │  │  Store  │ │UIMgr  │ │   AuthMgr      │  │  │
│  │  └────┬────┘ └───┬───┘ └───────┬────────┘  │  │
│  │       │          │             │            │  │
│  │  ┌────▼──────────▼─────────────▼─────────┐  │  │
│  │  │            Services                   │  │  │
│  │  │  AudioService│LLMService│DataService  │  │  │
│  │  │  TextFitter  │Celebration│Analytics   │  │  │
│  │  └────────────────┬──────────────────────┘  │  │
│  │                   │                         │  │
│  │  ┌────────────────▼──────────────────────┐  │  │
│  │  │           Game Modes                  │  │  │
│  │  │  Flashcard│Quiz│TF│Match│Voice│Sent   │  │  │
│  │  │  Story(LLM)                           │  │  │
│  │  └───────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐   │
│  │  NativeTTSBridge  │  │   AndroidBridge      │   │
│  │  (Android TTS)    │  │   (Ollama LLM)       │   │
│  └──────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────┘
         │                      │
    ┌────▼────┐          ┌──────▼──────┐
    │ Android │          │  Firebase   │
    │ WebView │          │  RTDB/Auth  │
    │ + TTS   │          └─────────────┘
    └─────────┘
```

## Key Design Patterns

- **Class-based game modes** — `GameMode` base class provides shared nav, keyboard, scoring, audio, rendering
- **Service layer** — AudioService, TextFitter, CelebrationService, LLMService, AnalyticsService are injected into App
- **Preferences** — All settings stored in localStorage via Store class, loaded on app init
- **Bridge pattern** — Native Android features (TTS, LLM) accessed via JS bridge interfaces that fall back to web APIs

## Data Flow

1. App starts → Firebase Auth (anonymous) → DataService.load() → vocab list
2. User launches game → GameMode constructor → getFilteredList() → render()
3. Score → DataService.recordScore() → Firebase RTDB (ServerValue.increment)
4. Settings change → Store.saveSettings() → localStorage → game.update()

## Audio Pipeline

```
playSmartAudio(langKey)
  ├── NativeTTSBridge.isAvailable() → NativeTTSBridge.speak()
  └── Web Speech API → speechSynthesis.speak()
```
