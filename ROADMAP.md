# bodygroovn Roadmap

This roadmap records deliberately deferred work. Neither phase is part of the bodygroovn v6.0.0 release scope. Each phase requires its own requirements, implementation plan, and regression baseline before work begins.

## Phase 2 — TypeScript application rewrite

Rewrite the maintained JavaScript and JSX application surfaces as TypeScript and TSX. TypeScript 6 is used for configuration, declarations, and tests in v6.0.0, but production source conversion is intentionally deferred.

Before implementation, define:

- module-by-module migration boundaries;
- public and CEP bridge type contracts;
- ExtendScript interoperability rules;
- regression fixtures for render, preview, settings, and report behavior;
- a migration order that keeps the extension buildable after each change.

## Phase 3 — Repository structure redesign

Study the management patterns in `../resume`, then redesign bodygroovn's folder structure and directory-management conventions where those patterns are demonstrably useful.

Before implementation, document:

- the current and proposed ownership boundaries;
- generated-file and source-of-truth relationships;
- build and packaging path changes;
- migration and rollback steps;
- regression criteria proving that the ZXP payload and exporter output remain unchanged.
