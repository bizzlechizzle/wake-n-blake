# Wake-n-Blake Complete Audit & Remediation Plan

> **Audit Date**: 2025-12-22
> **Version Audited**: 0.1.0
> **Auditor**: Claude Code
> **Status**: IN PROGRESS

---

## Executive Summary

Wake-n-Blake is a **vibe-coded** CLI for BLAKE3 hashing, file verification, and provenance tracking. The codebase is ~80% functional with good architecture, but requires hardening before production use.

### Overall Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Core Functionality** | 85% | Hashing, ID gen, manifest work well |
| **CLI Completeness** | 70% | Missing some documented commands |
| **Test Coverage** | 45% | Integration tests exist, unit tests sparse |
| **Documentation** | 60% | techguide.md excellent, README needs work |
| **Error Handling** | 55% | Happy path solid, edge cases weak |
| **Universal Library** | 20% | CLI-focused, needs programmatic API |

### Critical Issues (Must Fix)

1. **No VERSION file** - CLAUDE.md requires it
2. **Missing core tests** - Hasher, copier, verifier untested
3. **No programmatic API exports** - Can't use as library
4. **Inconsistent error codes** - Exit codes don't match spec

### Blocking for Release

- [ ] Create VERSION file (0.1.0)
- [ ] Export public API from index.ts
- [ ] Add unit tests for core modules
- [ ] Fix exit codes per techguide spec

---

## Part 1: Code vs Spec Audit

### 1.1 CLI Commands - Implementation Status

| Command | Documented | Implemented | Tests | Notes |
|---------|------------|-------------|-------|-------|
| `wnb hash` | ✅ | ✅ | ❌ | Works, needs unit tests |
| `wnb id` | ✅ | ✅ | ❌ | Works |
| `wnb uuid` | ✅ | ✅ | ❌ | Works |
| `wnb ulid` | ✅ | ✅ | ❌ | Works |
| `wnb verify` | ✅ | ✅ | ❌ | Works |
| `wnb manifest` | ✅ | ✅ | ❌ | Works |
| `wnb check` | ✅ | ✅ | ❌ | Works |
| `wnb audit` | ✅ | ✅ | ❌ | Works |
| `wnb diff` | ✅ | ✅ | ❌ | Works |
| `wnb copy` | ✅ | ✅ | ❌ | Works |
| `wnb import` | ✅ | ✅ | ✅ | Integration tests exist |
| `wnb sidecar` | ✅ | ✅ | ✅ | Unit tests exist |
| `wnb device` | ✅ | ✅ | ✅ | Unit tests exist |
| `wnb meta` | ✅ | ✅ | ✅ | Unit tests exist |
| `wnb dedup` | ✅ | ✅ | ❌ | Needs tests |
| `wnb rename` | ✅ | ✅ | ❌ | Needs tests |
| `wnb fast` | ✅ | ✅ | ❌ | Needs tests |
| `wnb diagnose` | ✅ | ✅ | ❌ | Needs tests |

**Score: 18/18 commands implemented (100%)**
**Test Coverage: 4/18 commands have tests (22%)**

### 1.2 Zod Schemas - Usage Status

| Schema | Defined | Used | Notes |
|--------|---------|------|-------|
| Blake3HashSchema | ✅ | ⚠️ | Defined but not used for runtime validation |
| Blake3FullHashSchema | ✅ | ⚠️ | Defined but not used for runtime validation |
| Sha256HashSchema | ✅ | ⚠️ | Defined but not used for runtime validation |
| Sha512HashSchema | ✅ | ⚠️ | Defined but not used for runtime validation |
| AlgorithmSchema | ✅ | ✅ | Used in type exports |
| ManifestSchema | ✅ | ⚠️ | Should validate loaded manifests |
| ImportSessionSchema | ✅ | ⚠️ | Should validate checkpoint files |
| XmpSidecar schemas | ✅ | ✅ | Used in writer/reader |

**Issue**: Schemas defined but not used for runtime validation. Consider adding `.parse()` calls.

### 1.3 Exit Codes - Compliance

| Code | Spec Meaning | Implemented | Notes |
|------|--------------|-------------|-------|
| 0 | Success | ✅ | |
| 1 | General error / hash mismatch | ✅ | |
| 2 | File not found | ❌ | Uses 1 instead |
| 3 | Invalid input | ❌ | Uses 1 instead |
| 4 | Network error (after retries) | ✅ | Used for partial errors in import |
| 5 | Aborted by user | ❌ | Not implemented |
| 10-13 | Audit-specific codes | ❌ | Not implemented |
| 20-23 | Sidecar-specific codes | ❌ | Not implemented |
| 30-31 | Device-specific codes | ❌ | Not implemented |

**Action Required**: Implement granular exit codes per spec.

### 1.4 Output Formats

| Format | Documented | Implemented | Notes |
|--------|------------|-------------|-------|
| text | ✅ | ✅ | Default |
| json | ✅ | ✅ | Works |
| csv | ✅ | ❌ | Not implemented |
| bsd | ✅ | ❌ | Not implemented |
| sfv | ✅ | ❌ | Not implemented |

**Action Required**: Implement csv, bsd, sfv output formats.

---

## Part 2: CLAUDE.md Compliance

### 2.1 Version File

**Status**: ❌ MISSING

CLAUDE.md requires:
```
### App versions
- Format: `MAJOR.MINOR.PATCH` (e.g., `1.0.12`)
- Apps receive `.depot-version` file indicating synced repo-depot version
```

**Action Required**: Create `VERSION` file containing `0.1.0`

### 2.2 Testing Requirements

**Status**: ⚠️ PARTIAL

CLAUDE.md requires:
> - Write tests for new functionality
> - Run affected tests before marking complete
> - Test edge cases and error paths

Current test files:
- `tests/unit/xmp-writer.test.ts` - 12 tests
- `tests/unit/xmp-reader.test.ts` - ~10 tests
- `tests/unit/device-detection.test.ts` - 17 tests
- `tests/unit/metadata-extraction.test.ts` - ~15 tests
- `tests/unit/related-files.test.ts` - ~8 tests
- `tests/integration/import-pipeline.test.ts` - 14 tests

**Missing Tests**:
- `src/core/hasher.ts` - No unit tests
- `src/core/copier.ts` - No unit tests
- `src/core/id-generator.ts` - No unit tests
- `src/core/fast-hasher.ts` - No unit tests
- `src/services/scanner.ts` - No unit tests
- `src/services/deduplicator.ts` - No unit tests
- All CLI commands - No unit tests

### 2.3 Code Quality

| Rule | Compliant | Notes |
|------|-----------|-------|
| Explicit over implicit | ✅ | Types are explicit |
| Pure functions | ⚠️ | Some side effects in importer |
| Descriptive names | ✅ | Clear naming |
| Early returns | ✅ | Used appropriately |
| No magic numbers | ⚠️ | Some (16, 64, 128) could be constants |
| No global mutable state | ⚠️ | `nativeB3sumPath` cache, `detectorInstance` singleton |

### 2.4 Security

| Check | Status | Notes |
|-------|--------|-------|
| Input validation at boundaries | ⚠️ | CLI args not validated with Zod |
| No secrets logging | ✅ | No credential handling |
| Parameterized queries | N/A | No database |
| Output escaping | ✅ | XML escaping in XMP writer |

---

## Part 3: Edge Cases & Error Handling

### 3.1 Identified Edge Cases

| Scenario | Handled | Test | Priority |
|----------|---------|------|----------|
| Empty file hash | ❓ | ❌ | Medium |
| Very large file (>4GB) | ⚠️ | ❌ | High |
| Unicode filenames | ❓ | ❌ | High |
| Symlinks | ⚠️ | ❌ | Medium |
| Permission denied | ⚠️ | ❌ | High |
| Disk full during copy | ⚠️ | ❌ | High |
| Network disconnect | ⚠️ | ❌ | High |
| Interrupted import (SIGINT) | ⚠️ | ❌ | High |
| Corrupt manifest JSON | ⚠️ | ❌ | Medium |
| Hash collision (blake3-16) | N/A | ❌ | Low |
| Concurrent access | ❌ | ❌ | Medium |
| Read-only destination | ⚠️ | ❌ | Medium |
| Source disappears mid-import | ⚠️ | ❌ | Medium |

### 3.2 Error Messages

Current: Generic error messages
Needed: Actionable error messages with resolution hints

Example improvement:
```
// Current
throw new Error('Cannot stat file');

// Improved
throw new Error(`Cannot read file: ${filePath}. Check file exists and you have read permission.`);
```

---

## Part 4: Universal Library API

### 4.1 Current Export Structure

```typescript
// src/index.ts - Only exports CLI runner
export { run, createCli } from './cli/index.js';
```

### 4.2 Required Public API

```typescript
// Proposed src/index.ts
export * from './core/hasher.js';
export * from './core/id-generator.js';
export * from './core/copier.js';
export * from './core/fast-hasher.js';
export * from './services/importer.js';
export * from './services/device/index.js';
export * from './services/xmp/writer.js';
export * from './services/xmp/reader.js';
export * from './services/metadata/index.js';
export * from './schemas/index.js';

// CLI exports (for programmatic CLI use)
export { run, createCli } from './cli/index.js';
```

### 4.3 Usage Example

```typescript
// Other apps can then do:
import { hashFile, generateBlake3Id, runImport } from 'wake-n-blake';

const result = await hashFile('/path/to/file', 'blake3');
console.log(result.hash);
```

---

## Part 5: Documentation Gaps

### 5.1 README.md

| Section | Status | Action |
|---------|--------|--------|
| Installation | ⚠️ | Add npx, global, local options |
| Quick Start | ⚠️ | Add common workflows |
| CLI Reference | ⚠️ | Missing many options |
| API Reference | ❌ | Add programmatic API docs |
| Configuration | ❌ | Add .wnbignore, env vars |
| Troubleshooting | ❌ | Add common issues |
| Contributing | ❌ | Add contribution guide |

### 5.2 Developer Guide

**Missing**: A DEVELOPMENT.md with:
- Architecture overview
- Adding new commands
- Adding new hash algorithms
- Testing strategy
- Release process

---

## Part 6: Remediation Plan

### Phase 1: Critical Fixes (Blocking Release)

1. **Create VERSION file**
   - File: `VERSION`
   - Content: `0.1.0`

2. **Export public API**
   - File: `src/index.ts`
   - Export all core functions

3. **Add core unit tests**
   - `tests/unit/hasher.test.ts`
   - `tests/unit/id-generator.test.ts`
   - `tests/unit/copier.test.ts`

4. **Fix exit codes**
   - Create exit code constants
   - Update all command handlers

### Phase 2: Quality Improvements

1. **Runtime validation**
   - Add Zod `.parse()` calls at API boundaries

2. **Error message improvements**
   - Add actionable error messages
   - Include file paths in errors

3. **Missing output formats**
   - Implement csv, bsd, sfv

4. **Edge case handling**
   - Empty files
   - Large files
   - Permission errors

### Phase 3: Documentation

1. **Update README.md**
   - Full CLI reference
   - API examples
   - Configuration

2. **Create DEVELOPMENT.md**
   - Architecture
   - Contributing
   - Testing

### Phase 4: Polish

1. **Additional tests**
   - CLI command tests
   - Edge case tests

2. **Performance optimization**
   - Worker pool tuning
   - Memory profiling

---

## Part 7: Implementation Checklist

### Immediate Actions (Do Now)

- [ ] Create `VERSION` file with `0.1.0`
- [ ] Update `src/index.ts` to export public API
- [ ] Create `tests/unit/hasher.test.ts`
- [ ] Create `tests/unit/id-generator.test.ts`
- [ ] Run full test suite, ensure passing
- [ ] Update package.json version to match

### Short-term Actions (This Sprint)

- [ ] Create exit code constants file
- [ ] Update CLI handlers with proper exit codes
- [ ] Add Zod validation at API boundaries
- [ ] Implement csv output format
- [ ] Improve error messages
- [ ] Update README.md with full CLI reference

### Medium-term Actions (Next Sprint)

- [ ] Create DEVELOPMENT.md
- [ ] Add edge case tests
- [ ] Implement bsd/sfv output formats
- [ ] Add performance benchmarks
- [ ] Create MCP server wrapper

---

## Appendix A: File Inventory

### Source Files (46 files)

```
src/
├── index.ts                 # Entry point (needs API exports)
├── cli/
│   ├── index.ts            # CLI router
│   ├── output.ts           # Output formatters
│   └── commands/
│       ├── hash.ts
│       ├── verify.ts
│       ├── id.ts
│       ├── uuid.ts
│       ├── ulid.ts
│       ├── manifest.ts
│       ├── copy.ts
│       ├── import.ts
│       ├── sidecar.ts
│       ├── device.ts
│       ├── meta.ts
│       ├── dedup.ts
│       ├── rename.ts
│       ├── fast.ts
│       └── diagnose.ts
├── core/
│   ├── hasher.ts           # Multi-algorithm hashing
│   ├── id-generator.ts     # ID generation
│   ├── copier.ts           # Network-safe copy
│   ├── fast-hasher.ts      # Sampling hasher
│   ├── config.ts           # Configuration
│   └── constants.ts        # Constants
├── services/
│   ├── importer.ts         # Import pipeline
│   ├── scanner.ts          # File scanner
│   ├── deduplicator.ts     # Deduplication
│   ├── worker-pool.ts      # Worker management
│   ├── xmp/
│   │   ├── writer.ts
│   │   ├── reader.ts
│   │   └── schema.ts
│   ├── device/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── macos.ts
│   │   ├── linux.ts
│   │   └── windows.ts
│   ├── metadata/
│   │   ├── index.ts
│   │   └── wrappers/
│   │       ├── exiftool.ts
│   │       ├── ffprobe.ts
│   │       └── mediainfo.ts
│   ├── file-type/
│   │   └── detector.ts
│   └── related-files/
│       └── index.ts
├── schemas/
│   └── index.ts            # Zod schemas
├── utils/
│   ├── network.ts
│   ├── ignore.ts
│   └── [others]
└── workers/
    └── hash.worker.ts
```

### Test Files (6 files)

```
tests/
├── unit/
│   ├── xmp-writer.test.ts
│   ├── xmp-reader.test.ts
│   ├── device-detection.test.ts
│   ├── metadata-extraction.test.ts
│   └── related-files.test.ts
└── integration/
    └── import-pipeline.test.ts
```

---

## Appendix B: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-22 | Claude Code | Initial audit |
