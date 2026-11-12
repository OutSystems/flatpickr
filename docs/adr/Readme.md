# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the OutSystems fork of Flatpickr.
ADRs are short documents that capture important decisions, along with their context and consequences.
They record why this fork differs from upstream Flatpickr, so the changes can be kept, reviewed or proposed
upstream later.

## Purpose

- To document why the fork changes Flatpickr's behaviour or adds options.
- To provide context for why decisions were made.
- To help onboard new team members.
- To provide context to AI-powered development assistants.

## Format

Each ADR should follow the template in `ADR-0000-Title-of-ADR.md` (the same template used in OutSystems UI).

## Process

1.  **Propose:** Copy `ADR-0000-Title-of-ADR.md` to a new file named `ADR-NNNN-title-of-adr.md`, where `NNNN` is the next sequential number and the rest is a dash-separated, lowercase version of the title.
2.  **Discuss:** Fill out the ADR and discuss it with the team.
3.  **Decide:** Once a decision is reached, update the status in the ADR (e.g., "Accepted", "Rejected", "Superseded").
4.  **Commit:** Commit the ADR to the repository.

## ADR Log

| ADR Number | Title                                                          | Status   | Date       |
| :--------- | :------------------------------------------------------------- | :------- | :--------- |
| ADR-0000   | Template for ADRs                                              | Meta     | 2026-11-09 |
| ADR-0001   | Opt-in strict parsing and an invalid-input hook for typed text | Proposed | 2026-11-09 |
