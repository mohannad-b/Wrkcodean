# Simplified AI Builder Proposal

## Problem with Current Approach

The current `mergeAIResponse()` function is **~200 lines of complex merge logic** that:
- Matches steps by step number
- Preserves existing step data
- Merges AI updates with existing steps
- Handles branch relationships
- Reconciles connections
- Preserves steps not mentioned by AI
- Has many edge cases and potential bugs

**Issues:**
- Complex step number matching can fail
- ID preservation logic is error-prone
- Connection reconciliation can create cycles
- Section merging only works if sections are empty
- Hard to debug when things go wrong

## Proposed Solution: Recreate from Scratch

Since the AI already receives **full context**:
- Current workflow state (all steps, branches, sections)
- Requirements document
- Full conversation history
- User's latest request

The AI should naturally **maintain consistency** when generating a complete workflow.

## New Approach

1. **AI generates complete workflow** from scratch based on full context
2. **Preserve only essential data**:
   - **Step IDs** (match by step number or name similarity)
   - **Task IDs** (linked to steps via `taskIds` array)
   - **Node positions** (from `metadata.nodePositions`)
   - **Section content** (if user has edited, don't overwrite)

3. **Much simpler logic** (~100 lines vs ~200 lines)

## Implementation

### Key Function: `preserveEssentialData()`

```typescript
function preserveEssentialData(
  currentBlueprint: Blueprint,
  aiSteps: AIStep[],
  aiBranches: AIBranch[],
  aiSections: Record<string, string>
): { blueprint: Blueprint }
```

**Process:**
1. Build maps of existing steps by step number and name
2. Convert AI steps to Blueprint steps:
   - Match by step number first, then by name
   - Preserve ID from existing step if matched
   - Preserve `taskIds` from existing step
   - Use AI data for everything else
3. Resolve `nextStepIds` using step numbers
4. Convert AI branches, preserving IDs where possible
5. Update sections (only if currently empty)
6. Preserve metadata (node positions)

## Benefits

✅ **Simpler code** - Easier to understand and maintain  
✅ **Fewer bugs** - Less complex logic = fewer edge cases  
✅ **Easier to debug** - Clear flow: AI generates → preserve IDs → done  
✅ **Same result** - AI has full context, so output should be consistent  
✅ **Preserves user data** - IDs, positions, tasks, edited sections all preserved  

## What Gets Preserved

| Data | How It's Preserved |
|------|-------------------|
| Step IDs | Matched by step number or name |
| Task IDs | Copied from existing step's `taskIds` array |
| Node Positions | Preserved in `metadata.nodePositions` |
| Section Content | Only updated if currently empty |
| Branch IDs | Matched by parent/target step IDs |

## What Gets Regenerated

| Data | Why It's Safe |
|------|--------------|
| Step names/descriptions | AI has full context, should maintain consistency |
| Step connections | AI sees current connections, should preserve them |
| Branch conditions | AI sees current branches, should preserve them |
| Section content (if empty) | AI can populate empty sections |

## Migration Path

1. Create new `ai-builder-simple.ts` (✅ Done)
2. Test with existing workflows
3. Switch API route to use new builder
4. Monitor for issues
5. Remove old merge logic once stable

## Testing Checklist

- [ ] AI adds new step → ID preserved for existing steps
- [ ] AI modifies step → ID preserved, taskIds preserved
- [ ] AI removes step → Other step IDs preserved
- [ ] User drags nodes → Positions preserved after AI update
- [ ] Tasks linked to steps → Still linked after AI update
- [ ] User edits section → Not overwritten by AI
- [ ] Empty section → Populated by AI

## Risk Assessment

**Low Risk:**
- AI has full context, so should maintain consistency
- ID preservation is simple matching logic
- User data (positions, tasks, edited sections) is preserved

**Mitigation:**
- Test thoroughly with existing workflows
- Monitor for any ID mismatches
- Can rollback easily if issues arise



