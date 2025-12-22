# UUID (Universally Unique Identifier): Complete Technical Reference

> **Generated**: 2025-12-21
> **Sources current as of**: 2025-12-21
> **Scope**: Comprehensive
> **Version**: 1.0
> **Standards**: RFC 4122 (obsolete), RFC 9562 (current)

---

## TLDR

UUIDs are 128-bit identifiers designed for distributed systems to generate unique IDs without central coordination. RFC 9562 (published May 2024) supersedes RFC 4122 and introduces three new versions (v6, v7, v8). For most modern applications, **use UUID v7** for database primary keys (sortable, timestamp-based) or **UUID v4** for general-purpose random IDs. Version 4 collision probability is negligible (requires 2.71 quintillion UUIDs for 50% collision chance). This guide covers all 8 UUID versions, Node.js implementation, database optimization strategies, and best practices for production systems.

---

## What are UUIDs?

### Definition

A Universally Unique Identifier (UUID) is a 128-bit label used for information in computer systems. The term globally unique identifier (GUID) is also used, particularly in Microsoft systems. UUIDs are designed to be unique across space and time without requiring a central registration authority.

### Standard Format

UUIDs are represented as 32 hexadecimal digits displayed in five groups separated by hyphens, in the form **8-4-4-4-12**:

```
550e8400-e29b-41d4-a716-446655440000
└─┬──┘ └┬┘ └┬┘ └┬┘ └────┬─────┘
  │     │   │   │       │
  8     4   4   4      12 hex digits
```

**Total**: 36 characters (32 hex digits + 4 hyphens)

**Binary size**: 128 bits (16 bytes)

### RFC Standards Evolution

| Standard | Published | Status | Key Changes |
|----------|-----------|--------|-------------|
| RFC 4122 | July 2005 | Obsolete | Defined v1-v5 |
| RFC 9562 | May 2024 | Current | Added v6, v7, v8; clarified ambiguities |

The IETF published RFC 9562 as a revision of RFC 4122, introducing three new UUID versions and modernizing the specification for contemporary distributed systems. [1][2]

---

## UUID Structure

### Bit Layout

All UUID versions share a common structure with version and variant fields:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          time/random                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       time/random             |  ver  |       time/random     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|var|                   time/random/node                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          time/random/node                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Reserved Fields

| Field | Bits | Position | Purpose |
|-------|------|----------|---------|
| Version | 4 bits | M position (bits 48-51) | Identifies UUID version (1-8) |
| Variant | 2-3 bits | N position (bits 64-65) | RFC 9562 variant = 10x |

These reserved fields leave **122 bits** of data for version-specific information in v4 random UUIDs.

---

## UUID Versions: Complete Breakdown

### Version 1: Time-Based + MAC Address

**Structure**: 60-bit timestamp + 48-bit MAC address + 14-bit clock sequence

**Timestamp**: 100-nanosecond intervals since midnight, October 15, 1582 (Gregorian calendar epoch)

**Components**:
- Time (60 bits): Provides uniqueness across time
- Clock sequence (14 bits): Guards against clock rollback
- Node ID (48 bits): MAC address of generating machine

**Characteristics**:
- Sortable by generation time
- Reveals MAC address (privacy concern)
- Requires system MAC address or random node ID
- Time precision: 100 nanoseconds

**Use Cases**:
- Legacy systems requiring time-ordered IDs
- Systems where MAC address disclosure is acceptable
- Backward compatibility with older UUID implementations

**Example**: `92f62d9e-22c4-11ef-97e9-325096b39f47`

**Advantages**:
- Naturally time-ordered
- Low collision risk even at high generation rates

**Disadvantages**:
- Privacy: Exposes MAC address
- Not optimal for database indexing (time bits are shuffled)
- Clock synchronization issues in distributed systems

**Sources**: [1][2][3]

---

### Version 2: DCE Security (Rare)

**Status**: Rarely used in practice

**Structure**: Similar to v1 but replaces portions of timestamp with POSIX UID/GID

**Components**:
- Reduced timestamp precision (loses some time bits)
- Local domain identifier (UID or GID)
- MAC address

**Why it's rarely used**:
- Lossy timestamp representation
- Limited applicability (specific to DCE environments)
- Privacy concerns (MAC address + account ID)
- Poor documentation in original specs

**Recommendation**: Avoid unless specifically required for DCE compatibility.

**Sources**: [1]

---

### Version 3: Name-Based (MD5 Hash)

**Structure**: MD5 hash of namespace UUID + name

**Hash Algorithm**: MD5 (128-bit output, directly used as UUID)

**Namespaces**: Predefined namespace UUIDs for different domains:
- DNS: `6ba7b810-9dad-11d1-80b4-00c04fd430c8`
- URL: `6ba7b811-9dad-11d1-80b4-00c04fd430c8`
- OID: `6ba7b812-9dad-11d1-80b4-00c04fd430c8`
- X.500 DN: `6ba7b814-9dad-11d1-80b4-00c04fd430c8`

**Deterministic**: Same namespace + name always produces the same UUID

**Use Cases**:
- Generating consistent UUIDs from known identifiers
- Content-addressed storage
- Deduplication systems

**Example Generation**:
```
UUID v3 = MD5(namespace_uuid + name)
namespace: 6ba7b810-9dad-11d1-80b4-00c04fd430c8 (DNS)
name: "example.com"
result: Deterministic UUID based on these inputs
```

**Advantages**:
- Reproducible (same inputs = same UUID)
- No state required
- Can generate offline

**Disadvantages**:
- MD5 is cryptographically broken (collision attacks exist)
- Not suitable for security-sensitive applications
- Superseded by v5 (use v5 instead)

**Recommendation**: Use v5 instead; MD5 is deprecated for security reasons.

**Sources**: [1][2]

---

### Version 4: Random (Most Common)

**Structure**: 122 bits of random or pseudo-random data

**Random Bits**: All bits are random except version (4 bits) and variant (2 bits)

**Characteristics**:
- Fully random generation
- No coordination required
- No timestamp or node information
- Most widely supported version

**Use Cases**:
- General-purpose unique identifiers
- Session IDs
- Transaction IDs
- API keys (when additional security measures applied)
- Any scenario not requiring sortability

**Example**: `550e8400-e29b-41d4-a716-446655440000`

**Collision Probability** (see dedicated section below):
- 1 billion UUIDs: ~10⁻¹⁸ collision probability
- 50% collision probability: 2.71 quintillion UUIDs

**Advantages**:
- Simple to generate
- No privacy concerns (no MAC address)
- Widely supported across all platforms
- Good default choice

**Disadvantages**:
- Not sortable (completely random)
- Poor database index performance for large tables
- Requires quality random number generator

**Recommendation**: Default choice for most applications not requiring sortability.

**Sources**: [1][2][6][7]

---

### Version 5: Name-Based (SHA-1 Hash)

**Structure**: SHA-1 hash of namespace UUID + name (truncated to 128 bits)

**Hash Algorithm**: SHA-1 (160-bit output, truncated to 128 bits)

**Namespaces**: Same predefined namespaces as v3

**Deterministic**: Same namespace + name always produces the same UUID

**Use Cases**:
- Generating consistent UUIDs from identifiers (improved security over v3)
- Content-addressed storage
- Deduplication
- Idempotent operations

**Example Generation**:
```
UUID v5 = SHA1(namespace_uuid + name)[0:128]
namespace: 6ba7b810-9dad-11d1-80b4-00c04fd430c8 (DNS)
name: "example.com"
result: Deterministic UUID with better security than v3
```

**Advantages**:
- Reproducible
- Stronger than v3 (SHA-1 vs MD5)
- No state required
- Offline generation

**Disadvantages**:
- SHA-1 has known collision vulnerabilities (though not critical for UUIDs)
- Not suitable for cryptographic security
- Not sortable

**Recommendation**: Preferred over v3 for name-based UUIDs. RFC 4122 officially recommends v5 over v3.

**Sources**: [1][2]

---

### Version 6: Reordered Time-Based (New in RFC 9562)

**Structure**: Same data as v1 but reordered for better sortability

**Components**:
- 60-bit timestamp (reordered for lexicographic sorting)
- 14-bit clock sequence
- 48-bit node ID (MAC address or random)

**Key Innovation**: Time fields are reordered so UUIDs sort chronologically

**Time Precision**: 100 nanoseconds (same as v1)

**Bit Layout**: High bits of timestamp are in the most significant position

**Use Cases**:
- Migration from v1 with improved database performance
- Systems requiring precise timestamps (100ns resolution)
- Time-ordered data with backward compatibility to v1

**Conversion**: Can convert between v1 and v6:
```javascript
import { v6ToV1, v1ToV6 } from 'uuid';
v6ToV1('1ef22c49-2f62-6d9e-97e9-325096b39f47');
v1ToV6('92f62d9e-22c4-11ef-97e9-325096b39f47');
```

**Advantages**:
- Naturally sortable (better than v1)
- High precision timestamps
- Compatible with v1 data

**Disadvantages**:
- Privacy concerns (MAC address)
- More complex than v7
- Requires 100ns clock precision

**Recommendation**: Use v7 instead for new systems (simpler, no MAC address).

**Sources**: [1][2][8]

---

### Version 7: Unix Timestamp + Random (New in RFC 9562, Recommended)

**Structure**: 48-bit Unix timestamp (milliseconds) + 74 bits random

**Timestamp**: Milliseconds since Unix epoch (January 1, 1970)

**Time Precision**: 1 millisecond

**Components**:
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    unix_ts_ms (48 bits)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|unix_ts_ms |  ver  |       rand_a (12 bits)                    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|var|                    rand_b (62 bits)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       rand_b (continued)                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Characteristics**:
- Sortable by creation time
- No privacy concerns (no MAC address)
- Sufficient randomness (74 bits)
- Simple timestamp (standard Unix milliseconds)

**Use Cases**:
- **Database primary keys** (optimal for B-tree indexes)
- Distributed ID generation
- Event logging and ordering
- Time-series data
- Any application requiring sortable UUIDs

**Platform Support (2025)**:
- PostgreSQL 18+ (native support)
- .NET 9+ (native support)
- Node.js: via `uuid` npm package
- Python 3.14+ (standard library)

**Example**: UUIDs generated later have lexicographically larger values

**Advantages**:
- **Optimal database performance** (natural index ordering)
- Sortable without external sorting logic
- No privacy issues
- Simple implementation
- Industry momentum (becoming standard)

**Disadvantages**:
- Lower time precision than v6 (1ms vs 100ns)
- Slightly less randomness than v4 (74 bits vs 122 bits)

**Recommendation**: **Strongly recommended for new applications**, especially database-centric systems.

**Sources**: [1][2][8][9][10][11][12]

---

### Version 8: Custom/Vendor-Specific (New in RFC 9562)

**Structure**: Custom format (user-defined)

**Reserved Fields**: Only version (4 bits) and variant (2-3 bits) are specified

**Remaining Bits**: 122 bits available for custom use

**Purpose**: Experimental or vendor-specific UUID formats

**Use Cases**:
- Proprietary ID schemes needing UUID compatibility
- Experimental identifier formats
- Domain-specific requirements not met by v1-v7

**Characteristics**:
- Maximum flexibility
- No standard interpretation
- Application-specific meaning

**Example Use**:
```
48-bit: Custom timestamp format
32-bit: Data center ID
32-bit: Machine ID
10-bit: Sequence number
(Plus version/variant bits)
```

**Advantages**:
- Complete customization within UUID format
- Can optimize for specific domain needs

**Disadvantages**:
- Non-standard (interpretation requires documentation)
- Reduced interoperability
- Higher implementation complexity

**Recommendation**: Only use when v1-v7 genuinely don't meet requirements. Document format thoroughly.

**Sources**: [1][2]

---

## Collision Probability: The Mathematics

### UUID v4 Collision Analysis

**Total Possible UUIDs**: 2¹²⁸ ≈ 3.4 × 10³⁸

**Random Bits in v4**: 122 bits (6 bits reserved for version/variant)

**Available Space**: 2¹²² ≈ 5.3 × 10³⁶ unique v4 UUIDs

### Birthday Paradox Formula

The collision probability for n generated UUIDs follows the birthday paradox:

```
P(collision) ≈ n² / (2 × 2¹²²)
```

### Real-World Probabilities

| UUIDs Generated | Collision Probability | Practical Context |
|-----------------|----------------------|-------------------|
| 1 billion (10⁹) | ~10⁻¹⁸ | Negligible |
| 1 trillion (10¹²) | ~10⁻¹⁵ | Effectively zero |
| 103 trillion | 1 in 1 billion | Still extremely rare |
| 2.71 quintillion (2.71 × 10¹⁸) | 50% | Theoretical threshold |

### 50% Collision Threshold

To reach a **50% probability** of at least one collision:

**Required UUIDs**: 2.71 quintillion (2.71 × 10¹⁸)

**Generation Rate**: If generating 1 billion UUIDs/second:
- Time required: ~86 years continuous generation

**Storage**: At 16 bytes per UUID:
- File size: ~43.4 exabytes

### Intuitive Comparisons

**Scale Comparison**:
- Sand grains on Earth: ~7.5 × 10¹⁸
- Stars in observable universe: ~10²²
- Total possible UUIDs (2¹²⁸): ~3.4 × 10³⁸ (3.4 × 10¹⁶ times all stars)

**Risk Comparison**:
The probability of UUID collision is **lower than**:
- Being struck by a meteorite
- Winning a major lottery multiple times
- Most "impossible" statistical events

### Known Collision Cases

All documented UUID collisions have resulted from **implementation errors**, not random chance:

1. **Manufacturer defaults**: Failing to overwrite default UUIDs in hardware
2. **Broken RNGs**: Poor random number generators
3. **Time synchronization**: Clock issues in v1 generation
4. **Implementation bugs**: Software errors in UUID libraries

**Conclusion**: Proper v4 UUID implementation has never produced a random collision.

### Best Practices for Collision Avoidance

1. **Use cryptographically secure random generators**
   - Node.js: `crypto.randomUUID()` or `uuid` package
   - NOT: `Math.random()` or weak PRNGs

2. **Add uniqueness constraints** (defense in depth)
   - Database: `UNIQUE` constraint on UUID columns
   - Especially critical for financial/medical systems

3. **Monitor for duplicates** in high-volume systems

4. **Prefer v7 for databases** (time-ordering + randomness)

**Sources**: [6][7][13]

---

## When to Use Each Version

### Decision Matrix

| Scenario | Recommended Version | Rationale |
|----------|-------------------|-----------|
| Database primary keys | **v7** | Sortable, optimal B-tree performance |
| General-purpose random IDs | **v4** | Simple, widely supported, no privacy issues |
| Content addressing / deterministic IDs | **v5** | Reproducible, better security than v3 |
| Legacy v1 migration | **v6** | Maintains compatibility, improves sorting |
| Custom requirements | **v8** | Maximum flexibility |
| Security tokens (with additional measures) | **v4** | High entropy, unpredictable |
| Event logs / time-series | **v7** | Natural chronological ordering |
| Distributed systems without coordination | **v4** or **v7** | No central authority needed |

### Version Preferences by Use Case

**Web Applications**:
- Session IDs: v4
- User IDs: v7 (if stored in database)
- API keys: v4 + additional security

**Database Design**:
- Primary keys: **v7** (optimal)
- Foreign keys: Match primary key version
- UUIDs in indexes: v7 > v6 > v4

**Microservices**:
- Request tracing: v7 (sortable across services)
- Service IDs: v4
- Event IDs: v7

**File Systems**:
- File identifiers: v4
- Content-addressed storage: v5

### Versions to Avoid

| Version | Status | Recommendation |
|---------|--------|----------------|
| v1 | Deprecated | Use v6 or v7 instead |
| v2 | Rarely implemented | Avoid unless required for DCE |
| v3 | Superseded | Use v5 instead (MD5 is weak) |

---

## UUID vs Alternative ID Formats

### Comparison Table

| Format | Size | Sortable | Timestamp | Readability | Collision Resistance |
|--------|------|----------|-----------|-------------|---------------------|
| UUID v4 | 128-bit | No | No | Medium | Excellent |
| UUID v7 | 128-bit | Yes | 1ms | Medium | Excellent |
| ULID | 128-bit | Yes | 1ms | High | Excellent |
| KSUID | 160-bit | Yes | 1s | Medium | Excellent |
| Snowflake | 64-bit | Yes | 1ms | Low | Good |
| NanoID | Variable | No | No | High | Variable |

### ULID (Universally Unique Lexicographically Sortable Identifier)

**Size**: 128-bit (26 characters Base32-encoded)

**Structure**:
- 48-bit timestamp (milliseconds)
- 80-bit random component

**Format**: `01ARZ3NDEKTSV4RRFFQ69G5FAV`

**Advantages**:
- Lexicographically sortable
- More readable (Base32, no special characters)
- Case-insensitive
- URL-safe

**Disadvantages**:
- Less standardized than UUID
- Larger string representation (26 vs 36 chars with hyphens)
- Newer specification (less ecosystem support)

**Use When**:
- Readability is important
- Logs or human-visible IDs
- Need sortability without UUIDs

**Performance** (2025): ~12M IDs/sec/core generation speed

**Sources**: [14][15]

---

### KSUID (K-Sortable Unique Identifier)

**Size**: 160-bit (27 characters Base62-encoded)

**Structure**:
- 32-bit timestamp (seconds, custom epoch)
- 128-bit random payload

**Format**: `0ujtsYcgvSTl8PAuAdqWYSMnLOv`

**Advantages**:
- Chronologically sortable
- Large random payload (128 bits)
- ~136-year timestamp range
- Created by Segment (proven in production)

**Disadvantages**:
- Larger than UUID/ULID (160 bits)
- Lower timestamp precision (1 second vs 1 millisecond)
- Less ecosystem adoption

**Use When**:
- Event-driven systems
- Kafka pipelines
- Maximum collision resistance needed
- Second-precision timestamps acceptable

**Performance** (2025): ~6M IDs/sec/core generation speed

**Sources**: [14][15]

---

### Snowflake ID

**Size**: 64-bit integer

**Structure**:
- 41-bit timestamp (milliseconds since custom epoch)
- 10-bit machine/datacenter ID
- 12-bit sequence number

**Advantages**:
- Compact (fits in 64-bit integer)
- Sortable
- High throughput (4096 IDs/millisecond/machine)
- 50-70% smaller database indexes
- Popularized by Twitter, used by Discord, Instagram

**Disadvantages**:
- Requires centralized coordination (machine IDs)
- Limited ID space per millisecond
- Custom epoch limits range (~69 years from epoch)
- Machine ID management overhead

**Use When**:
- Distributed systems with coordination
- High-performance OLTP databases
- Storage optimization critical
- Twitter-scale throughput needed

**Performance Impact**: Significantly faster database operations due to smaller index size

**Sources**: [14][15]

---

### NanoID

**Size**: Variable (default 21 characters, ~126 bits entropy)

**Structure**: Random characters from URL-safe alphabet

**Format**: `V1StGXR8_Z5jdHi6B-myT`

**Advantages**:
- Smaller than UUID (21 vs 36 chars)
- URL-safe by default
- Configurable size and alphabet
- Fast generation

**Disadvantages**:
- Not sortable
- No timestamp information
- Lower generation speed than ULID/UUID v7
- Variable format reduces standardization

**Use When**:
- URL shorteners
- Compact unique strings needed
- Front-end ID generation
- Custom alphabet requirements

**Performance** (2025): ~2M IDs/sec/core generation speed

**Sources**: [14][15]

---

### Recommendation Summary

**Choose UUID v7 if**:
- Building database-centric applications
- Need industry standard with growing ecosystem
- Want optimal B-tree index performance
- Require wide platform support (PostgreSQL 18+, .NET 9+, etc.)

**Choose ULID if**:
- Readability is priority
- Need human-friendly IDs in logs
- Want case-insensitive format

**Choose Snowflake if**:
- Extreme performance required
- Can manage machine ID coordination
- Storage space is critical
- Building Twitter/Discord-scale systems

**Choose UUID v4 if**:
- Don't need sortability
- Want maximum ecosystem support
- Prioritize simplicity

---

## Node.js UUID Package Usage

### Installation

```bash
npm install uuid
```

For TypeScript projects:
```bash
npm install @types/uuid
```

**Package**: `uuid` (most popular UUID library for Node.js)

**Node.js Version Support**: Node 18-24 (as of 2025)

---

### Basic Usage

#### UUID v4 (Random)

```javascript
import { v4 as uuidv4 } from 'uuid';

const id = uuidv4();
console.log(id);
// Example: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
```

#### UUID v1 (Timestamp + MAC)

```javascript
import { v1 as uuidv1 } from 'uuid';

const id = uuidv1();
console.log(id);
// Example: '92f62d9e-22c4-11ef-97e9-325096b39f47'

// With custom options
const customId = uuidv1({
  node: Uint8Array.of(0x01, 0x23, 0x45, 0x67, 0x89, 0xab),
  clockseq: 0x1234,
  msecs: new Date('2011-11-01').getTime(),
  nsecs: 5678,
});
```

#### UUID v5 (Name-based, SHA-1)

```javascript
import { v5 as uuidv5 } from 'uuid';

// Predefined namespace for DNS
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const id = uuidv5('example.com', DNS_NAMESPACE);
console.log(id);
// Always generates same UUID for 'example.com'
```

#### UUID v6 (Reordered Timestamp)

```javascript
import { v6 as uuidv6, v6ToV1, v1ToV6 } from 'uuid';

// Generate v6
const id = uuidv6();

// Convert between v1 and v6
const v1Id = v6ToV1('1ef22c49-2f62-6d9e-97e9-325096b39f47');
const v6Id = v1ToV6('92f62d9e-22c4-11ef-97e9-325096b39f47');
```

#### UUID v7 (Timestamp + Random, Recommended)

```javascript
import { v7 as uuidv7 } from 'uuid';

const id = uuidv7();
console.log(id);
// Sortable, timestamp-based UUID
```

---

### Validation

```javascript
import { v4 as uuidv4, validate, version } from 'uuid';

const id = uuidv4();

// Validate UUID format
console.log(validate(id));  // true
console.log(validate('not-a-uuid'));  // false

// Check version
console.log(version(id));  // 4

// Validate specific UUIDs
console.log(validate('6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'));  // true
```

---

### Parse and Stringify

```javascript
import { parse, stringify } from 'uuid';

// Parse UUID string to bytes
const bytes = parse('6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b');
console.log(bytes);
// Uint8Array(16) [110, 192, 189, 127, 17, 192, ...]

// Stringify bytes to UUID
const uuidBytes = Uint8Array.of(
  0x6e, 0xc0, 0xbd, 0x7f, 0x11, 0xc0, 0x43, 0xda,
  0x97, 0x5e, 0x2a, 0x8a, 0xd9, 0xeb, 0xae, 0x0b
);
const uuid = stringify(uuidBytes);
console.log(uuid);
// '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'
```

---

### Built-in Node.js Alternative

Node.js 14.17+ includes native UUID v4 generation:

```javascript
import { randomUUID } from 'crypto';

const id = randomUUID();
console.log(id);
// Example: 'a3bb189e-8bf9-3888-9912-ace4e6543002'
```

**Use `crypto.randomUUID()` when**:
- Only need v4 UUIDs
- Want zero dependencies
- Building for modern Node.js environments

**Use `uuid` package when**:
- Need v1, v5, v6, v7, or v8
- Require validation/parsing utilities
- Need maximum compatibility

---

### Production Example

```javascript
import { v7 as uuidv7, validate } from 'uuid';
import { createClient } from '@supabase/supabase-js';

class UserService {
  async createUser(email, name) {
    const userId = uuidv7(); // Time-sortable UUID

    // Validate before DB insertion (defensive programming)
    if (!validate(userId)) {
      throw new Error('Invalid UUID generated');
    }

    const user = await this.db.users.create({
      id: userId,
      email,
      name,
      created_at: new Date(),
    });

    return user;
  }
}

// Database schema (PostgreSQL)
/*
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- Index will perform well due to v7 sortability
CREATE INDEX idx_users_created ON users(created_at);
*/
```

**Sources**: [4][16][17][18]

---

## Database Considerations

### The UUID v4 Performance Problem

Random UUIDs (v4) cause significant performance issues as database primary keys:

**Problem**: Random values destroy index locality
- New inserts scattered throughout B-tree index
- Causes frequent page splits
- Increases write amplification
- Fragments index structure
- Requires entire index in buffer cache for good performance

**Index Size Comparison** (same data):

| Key Type | Index Size | Relative Size |
|----------|-----------|---------------|
| INT4 (32-bit) | 107 MB | 1.0x |
| INT8 (64-bit) | 150 MB | 1.4x |
| UUID | 237 MB | 2.2x |

**Performance Impact**:
- Sequential integers: Recently inserted rows are adjacent in index
- Random UUIDs: Recently inserted rows scattered across entire index
- Result: UUID indexes require ~2x more cache memory

---

### The UUID v7 Solution

**Why v7 Performs Better**:

1. **Timestamp prefix** (48 bits): New UUIDs append to end of B-tree
2. **Reduced page splits**: Monotonically increasing values
3. **Improved clustering**: Related records stay together
4. **Better cache utilization**: Recent data stays in hot pages

**Benchmark Results** (PostgreSQL):

| Metric | UUID v4 | UUID v7 | Improvement |
|--------|---------|---------|-------------|
| Insert throughput | Baseline | +30-50% | Significantly faster |
| Page splits | High | Low | ~70% reduction |
| Index fragmentation | High | Low | Minimal fragmentation |
| Range query performance | Poor | Excellent | Natural ordering |

**Write Amplification**: UUID v7 dramatically reduces I/O overhead for inserts

---

### PostgreSQL-Specific Guidance

#### Native UUID Support

```sql
-- Enable UUID extension (if not already available)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PostgreSQL 18+ includes native UUIDv7 support
-- Use gen_random_uuid() for v4
-- Use uuid_generate_v7() for v7 (PostgreSQL 18+)

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### UUID v7 in PostgreSQL 18+

```sql
-- Native v7 generation (PostgreSQL 18+)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index performs optimally due to natural ordering
CREATE INDEX idx_events_created ON events(created_at);
```

#### Migration from v4 to v7

```sql
-- Before: Poor performance
CREATE TABLE old_design (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- v4, random
  data TEXT
);

-- After: Optimized
CREATE TABLE new_design (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),  -- v7, sortable
  data TEXT
);

-- For existing v4 tables, consider:
-- 1. Generate v7 UUIDs in application layer
-- 2. Migrate data with application-generated v7 IDs
-- 3. Drop old table, rename new table
```

#### Index Optimization

```sql
-- B-tree index (default, optimal for v7)
CREATE INDEX idx_users_id ON users(id);

-- For range queries on timestamp-based UUIDs
CREATE INDEX idx_orders_created ON orders(created_at, id);

-- Partial index for active records
CREATE INDEX idx_active_users ON users(id) WHERE active = true;
```

---

### MySQL/InnoDB Guidance

**InnoDB Clustered Index**: Primary key determines physical row order

**Problem with v4**:
- Random primary keys cause page splits
- Physical row reordering overhead
- Severe fragmentation

**Solution**:
```sql
-- MySQL 8+ can reorder UUID1 timestamp bits
SELECT UUID_TO_BIN(UUID(), 1) as ordered_uuid;
-- swap_flag=1 reorders time fields for better sorting

-- Create table with binary UUID
CREATE TABLE users (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID(), 1)),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Convert back to string when selecting
SELECT BIN_TO_UUID(id) as uuid, email FROM users;
```

**For v7 in MySQL** (application-generated):
```sql
-- Generate v7 in application, store as binary
CREATE TABLE users (
  id BINARY(16) PRIMARY KEY,  -- v7 UUID from application
  email VARCHAR(255) UNIQUE NOT NULL
);

-- Application code generates v7, inserts as binary
-- No need for UUID_TO_BIN swap flag
```

---

### Storage Format: String vs Binary

#### String Storage (CHAR/VARCHAR)

```sql
-- PostgreSQL: native UUID type (recommended)
CREATE TABLE items (
  id UUID PRIMARY KEY
);
-- Storage: 16 bytes (efficient, binary under the hood)

-- MySQL: CHAR(36) for string UUIDs
CREATE TABLE items (
  id CHAR(36) PRIMARY KEY
);
-- Storage: 36 bytes (includes hyphens)
```

#### Binary Storage (BINARY)

```sql
-- MySQL binary storage
CREATE TABLE items (
  id BINARY(16) PRIMARY KEY
);
-- Storage: 16 bytes (more efficient)

-- Requires conversion functions
INSERT INTO items VALUES (UUID_TO_BIN('550e8400-e29b-41d4-a716-446655440000'));
SELECT BIN_TO_UUID(id) FROM items;
```

**Recommendation**:
- PostgreSQL: Use native `UUID` type
- MySQL: Use `BINARY(16)` with conversion functions
- String storage: Only if human readability in raw DB queries is critical

---

### Best Practices Summary

1. **Use UUID v7 for primary keys**
   - Optimal B-tree performance
   - Natural time ordering
   - Future-proof (growing standard)

2. **Add UNIQUE constraints** (defense in depth)
   ```sql
   CREATE TABLE users (
     id UUID PRIMARY KEY,
     email TEXT UNIQUE NOT NULL
   );
   ```

3. **Use native UUID types**
   - PostgreSQL: `UUID` type
   - MySQL: `BINARY(16)` with conversion functions

4. **Avoid UUID v4 for high-volume tables**
   - Exception: If table stays small (<1M rows)
   - Consider composite keys or sequences instead

5. **Index strategy**
   - Primary key: B-tree (default, optimal for v7)
   - Foreign keys: Index v7 UUIDs for join performance
   - Don't over-index: Each index has write overhead

6. **Monitor index health**
   ```sql
   -- PostgreSQL: Check index bloat
   SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
   FROM pg_tables
   WHERE tablename = 'your_table';
   ```

**Sources**: [19][20][21][22][23][24]

---

## Best Practices for Production

### 1. Choose the Right Version

**Default choice**: UUID v7 (database apps) or v4 (general purpose)

**Decision checklist**:
- [ ] Need sortability? → v7
- [ ] Database primary key? → v7
- [ ] General random ID? → v4
- [ ] Deterministic from name? → v5
- [ ] Legacy v1 migration? → v6

---

### 2. Use Cryptographically Secure Randomness

**Good** (Node.js):
```javascript
// Built-in crypto module
import { randomUUID } from 'crypto';
const id = randomUUID();

// uuid package (uses crypto internally)
import { v4 as uuidv4 } from 'uuid';
const id = uuidv4();
```

**Bad**:
```javascript
// NEVER use Math.random() for UUIDs
const badId = generateUuidWithMathRandom(); // Predictable, insecure
```

---

### 3. Add Database Uniqueness Constraints

**Always add constraints**, even though collisions are astronomically unlikely:

```sql
-- PostgreSQL
CREATE TABLE users (
  id UUID PRIMARY KEY,  -- Enforces uniqueness
  email TEXT UNIQUE NOT NULL
);

-- Add unique constraint to existing table
ALTER TABLE users ADD CONSTRAINT users_id_unique UNIQUE (id);
```

**Why**: Defense in depth for mission-critical systems (banking, healthcare)

---

### 4. Validate UUIDs at Boundaries

```javascript
import { validate, version } from 'uuid';

function createUser(userId, email) {
  // Validate format
  if (!validate(userId)) {
    throw new Error('Invalid UUID format');
  }

  // Validate version (if specific version required)
  if (version(userId) !== 7) {
    throw new Error('Must use UUID v7 for user IDs');
  }

  // Proceed with business logic
}
```

---

### 5. Storage Optimization

**PostgreSQL**:
```sql
-- Use native UUID type (efficient 16-byte storage)
CREATE TABLE events (
  id UUID PRIMARY KEY
);
```

**MySQL**:
```sql
-- Use BINARY(16) for efficiency
CREATE TABLE events (
  id BINARY(16) PRIMARY KEY
);

-- Helper functions
DELIMITER $$
CREATE FUNCTION BIN_TO_UUID(b BINARY(16))
RETURNS CHAR(36)
DETERMINISTIC
RETURN LOWER(CONCAT(
  HEX(SUBSTRING(b, 1, 4)), '-',
  HEX(SUBSTRING(b, 5, 2)), '-',
  HEX(SUBSTRING(b, 7, 2)), '-',
  HEX(SUBSTRING(b, 9, 2)), '-',
  HEX(SUBSTRING(b, 11, 6))
));
$$
```

---

### 6. API Design

**REST APIs**:
```javascript
// URL path
GET /users/550e8400-e29b-41d4-a716-446655440000

// Response format
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

**GraphQL**:
```graphql
scalar UUID

type User {
  id: UUID!
  email: String!
}
```

---

### 7. Logging and Debugging

**Include version information**:
```javascript
import { version } from 'uuid';

function logUuidInfo(id) {
  console.log({
    uuid: id,
    version: version(id),
    timestamp: extractTimestamp(id), // For v1, v6, v7
  });
}
```

**Timestamp extraction** (v7):
```javascript
function extractV7Timestamp(uuidStr) {
  // Remove hyphens, take first 12 hex chars (48 bits)
  const hex = uuidStr.replace(/-/g, '').substring(0, 12);
  const timestamp = parseInt(hex, 16);
  return new Date(timestamp);
}

const uuid = uuidv7();
console.log(extractV7Timestamp(uuid));
// Outputs approximate generation time
```

---

### 8. Testing Strategies

**Unit tests**:
```javascript
import { v7 as uuidv7, validate, version } from 'uuid';
import { describe, it, expect } from 'vitest';

describe('UUID Generation', () => {
  it('generates valid v7 UUIDs', () => {
    const id = uuidv7();
    expect(validate(id)).toBe(true);
    expect(version(id)).toBe(7);
  });

  it('generates sortable UUIDs', () => {
    const id1 = uuidv7();
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 5));
    const id2 = uuidv7();

    expect(id1 < id2).toBe(true); // Lexicographic comparison
  });

  it('detects invalid UUIDs', () => {
    expect(validate('not-a-uuid')).toBe(false);
    expect(validate('550e8400-e29b-41d4-a716-44665544000')).toBe(false); // Wrong length
  });
});
```

**Integration tests** (database):
```javascript
it('enforces UUID uniqueness in database', async () => {
  const userId = uuidv7();

  await db.users.create({ id: userId, email: 'test@example.com' });

  // Attempt duplicate insert
  await expect(
    db.users.create({ id: userId, email: 'other@example.com' })
  ).rejects.toThrow('duplicate key');
});
```

---

### 9. Migration Strategies

**Migrating from auto-increment to UUID**:

```sql
-- Step 1: Add UUID column
ALTER TABLE users ADD COLUMN uuid_id UUID;

-- Step 2: Populate with v7 UUIDs (application layer, or function)
UPDATE users SET uuid_id = uuid_generate_v7();

-- Step 3: Add uniqueness
ALTER TABLE users ADD CONSTRAINT users_uuid_unique UNIQUE (uuid_id);

-- Step 4: Update foreign keys (in stages)
-- Step 5: Switch primary key
ALTER TABLE users DROP CONSTRAINT users_pkey;
ALTER TABLE users ADD PRIMARY KEY (uuid_id);

-- Step 6: Drop old column
ALTER TABLE users DROP COLUMN id;
ALTER TABLE users RENAME COLUMN uuid_id TO id;
```

**Dual-key transition period**:
```javascript
// During migration, support both ID types
app.get('/users/:id', async (req, res) => {
  const { id } = req.params;

  const user = validate(id)
    ? await db.users.findByUuid(id)
    : await db.users.findByLegacyId(parseInt(id, 10));

  res.json(user);
});
```

---

### 10. Security Considerations

**UUIDs are NOT secrets**:
- UUID v4 has high entropy (122 bits)
- But: NOT designed for cryptographic security
- Don't use UUIDs alone for authentication tokens

**Good** (session tokens):
```javascript
import { randomBytes } from 'crypto';

// Cryptographically secure session token
const sessionToken = randomBytes(32).toString('hex'); // 256 bits

// Plus: store UUID session ID in database
const sessionId = uuidv7();
await db.sessions.create({
  id: sessionId,
  token: hash(sessionToken), // Store hashed
  userId: user.id,
});
```

**Bad**:
```javascript
// NEVER use UUID alone as authentication secret
const sessionToken = uuidv4(); // Insufficient for auth
```

**API rate limiting** (UUIDs are fine):
```javascript
// Track API usage by user UUID
const rateLimitKey = `ratelimit:${userUuid}`;
```

---

### 11. Documentation Standards

**Code comments**:
```javascript
/**
 * Creates a new user with a time-sortable UUID (v7).
 *
 * @returns {Promise<User>} User object with generated UUID
 *
 * Note: Uses UUID v7 for optimal database index performance.
 * The timestamp prefix ensures chronological sorting.
 */
async function createUser(email) {
  const id = uuidv7();
  // ...
}
```

**API documentation**:
```yaml
# OpenAPI spec
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
          description: |
            UUID v7 identifier. Time-sortable, guaranteed unique.
            Format: 8-4-4-4-12 hexadecimal with hyphens.
          example: "018c5e6d-7a88-7000-8000-0123456789ab"
```

---

### 12. Monitoring and Observability

**Track UUID generation metrics**:
```javascript
import { uuidv7 } from 'uuid';

function generateMonitoredUuid(context) {
  const start = performance.now();
  const id = uuidv7();
  const duration = performance.now() - start;

  metrics.histogram('uuid.generation.duration', duration, {
    version: '7',
    context,
  });

  return id;
}
```

**Database monitoring**:
```sql
-- PostgreSQL: Monitor UUID column growth
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE tablename IN (SELECT tablename FROM information_schema.columns WHERE data_type = 'uuid')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Limitations & Uncertainties

### Known Limitations

1. **UUID v7 time precision**: 1 millisecond granularity
   - If generating >1000 UUIDs/ms on single machine, randomness provides uniqueness
   - Not suitable for nanosecond-precision requirements (use v6 instead)

2. **Storage overhead**: 128 bits vs 64-bit integers
   - Indexes are ~2x larger than 64-bit IDs
   - Trade-off: Decentralized generation vs storage efficiency

3. **URL length**: 36 characters with hyphens
   - Longer than numeric IDs in URLs
   - Consider ULID for more compact representation

4. **Collision detection**: No built-in collision detection
   - Relies on database constraints
   - Application-level retry logic may be needed in extreme edge cases

### Version-Specific Uncertainties

**UUID v7**:
- Relatively new standard (RFC 9562 published May 2024)
- Growing but not yet universal platform support
- Some databases (e.g., PostgreSQL 17) don't have native v7 yet (coming in v18)

**UUID v8**:
- No standardized formats yet
- Application-specific implementations
- Interoperability concerns

### Database-Specific Considerations

**PostgreSQL**:
- Native v7 support in PostgreSQL 18+ (released 2025)
- Earlier versions require application-level generation or extensions

**MySQL/InnoDB**:
- Clustered indexes mean primary key choice is critical
- v4 UUIDs particularly problematic (worse than PostgreSQL)
- Requires UUID_TO_BIN conversion for efficiency

**SQLite**:
- No native UUID type (store as TEXT or BLOB)
- Limited performance benefits from v7 vs v4

### Ecosystem Maturity (2025)

**Strong support**:
- PostgreSQL 18+
- .NET 9+
- Python 3.14+
- Node.js (via `uuid` package)

**Emerging support**:
- Java (libraries available, not in standard library)
- Ruby (gems available)
- Rust (crates available)

**Limited support**:
- Older programming languages
- Legacy database systems

---

## Source Appendix

| # | Source | Date | Type | Used For |
|---|--------|------|------|----------|
| 1 | [UUID Versions Explained - UUIDTools.com](https://www.uuidtools.com/uuid-versions-explained) | 2024 | Technical Documentation | UUID version definitions |
| 2 | [Universally unique identifier - Wikipedia](https://en.wikipedia.org/wiki/Universally_unique_identifier) | 2024 | Encyclopedia | General UUID concepts |
| 3 | [UUID Versions and Specifications - Get UUID](https://get-uuid.com/Versions/) | 2024 | Technical Reference | Version specifications |
| 4 | [uuid — UUID objects according to RFC 9562 - Python Docs](https://docs.python.org/3/library/uuid.html) | 2024 | Official Documentation | RFC 9562 reference |
| 5 | [RFC 4122 - A Universally Unique IDentifier (UUID) URN Namespace](https://datatracker.ietf.org/doc/html/rfc4122) | 2005 | RFC Standard | Original specification |
| 6 | [Understanding UUIDs in Node.js - LogRocket Blog](https://blog.logrocket.com/uuids-node-js/) | 2024 | Technical Tutorial | Node.js implementation |
| 7 | [TIL: 8 versions of UUID and when to use them - nicole@web](https://ntietz.com/blog/til-uses-for-the-different-uuid-versions/) | 2024 | Technical Blog | Use case guidance |
| 8 | [UUID versions through the ages - boringcactus](https://www.boringcactus.com/2023/02/12/uuid-versions.html) | 2023 | Technical Blog | Version evolution |
| 9 | [Understanding UUID v4, UUID v7, Snowflake ID, and Nano ID - Medium](https://medium.com/@dinesharney/understanding-uuid-v4-uuid-v7-snowflake-id-and-nano-id-in-simple-terms-c50acf185b00) | 2024 | Technical Article | Format comparisons |
| 10 | [UUIDv7 Benefits](https://uuid7.com/) | 2024 | Resource Site | UUID v7 advantages |
| 11 | [UUID v7: Enhancing Sortable Unique Identifiers - DarthPedro's Blog](https://darthpedro.net/2024/08/15/uuid-v7-enhancing-sortable-unique-identifiers-for-developers/) | 2024 | Technical Blog | v7 implementation |
| 12 | [PostgreSQL 18 UUIDv7 Support - Neon](https://neon.com/postgresql/postgresql-18/uuidv7-support) | 2024 | Official Docs | PostgreSQL v7 support |
| 13 | [What are the odds? - Jonathan Hall](https://jhall.io/archive/2021/05/19/what-are-the-odds/) | 2021 | Technical Blog | Collision probability |
| 14 | [Understanding UUID v4, UUID v7, Snowflake ID comparisons - Medium](https://medium.com/@dinesharney/understanding-uuid-v4-uuid-v7-snowflake-id-and-nano-id-in-simple-terms-c50acf185b00) | 2024 | Technical Article | ID format comparisons |
| 15 | [What Are the Differences Between UUID, ULID, KSUID - DesignGurus](https://www.designgurus.io/course-play/grokking-scalable-systems-for-interviews/doc/what-are-the-differences-between-uuid-ulid-ksuid-and-snowflake-ids-and-how-do-i-choose) | 2024 | Educational Resource | Format comparison matrix |
| 16 | [uuid - npm](https://www.npmjs.com/package/uuid) | 2024 | Package Documentation | Node.js package reference |
| 17 | [4 Ways to Generate UUIDs in Node.js - Refine](https://refine.dev/blog/node-js-uuid/) | 2024 | Technical Tutorial | Node.js implementation examples |
| 18 | [Node.js NPM uuid - GeeksforGeeks](https://www.geeksforgeeks.org/node-js/node-js-npm-uuid/) | 2024 | Technical Tutorial | npm package usage |
| 19 | [Avoid UUID Version 4 Primary Keys (for Postgres) - Andy Atkinson](https://andyatkinson.com/avoid-uuid-version-4-primary-keys) | 2024 | Technical Blog | PostgreSQL performance |
| 20 | [Performance of ULID and UUID in Postgres Database - DZone](https://dzone.com/articles/performance-of-ulid-and-uuid-in-postgres-database) | 2024 | Performance Analysis | Database benchmarks |
| 21 | [Unexpected downsides of UUID keys in PostgreSQL - CYBERTEC](https://www.cybertec-postgresql.com/en/unexpected-downsides-of-uuid-keys-in-postgresql/) | 2023 | Technical Article | PostgreSQL issues |
| 22 | [int4 vs int8 vs uuid vs numeric performance - CYBERTEC](https://www.cybertec-postgresql.com/en/int4-vs-int8-vs-uuid-vs-numeric-performance-on-bigger-joins/) | 2024 | Performance Analysis | Type comparison |
| 23 | [PostgreSQL UUID Performance: v4 vs v7 - DEV Community](https://dev.to/umangsinha12/postgresql-uuid-performance-benchmarking-random-v4-and-time-based-v7-uuids-n9b) | 2024 | Benchmark Article | v4 vs v7 comparison |
| 24 | [UUIDs Are Bad for Database Index Performance - toomanyafterthoughts](https://www.toomanyafterthoughts.com/uuids-are-bad-for-database-index-performance-uuid7/) | 2024 | Technical Blog | Index performance analysis |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-21 | Initial comprehensive UUID reference document |
