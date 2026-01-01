# Fork Tool Design Analysis

## Current State

### Layout
- **Two-column grid**: 50/50 split (1fr 1fr)
- **Left column**: Parameters with max-height: 80vh, scrollable
- **Right column**: Preview and metadata
- **Responsive**: Stacks to single column on mobile (< 968px)

### Content Density
- **5 collapsible sections** (most collapsed by default):
  1. Action Tiers (expanded) - 5 tiers × 2-3 controls each = ~15 controls
  2. Economic Nodes (collapsed) - ~10 controls
  3. Nested Multisig Teams (collapsed) - ~4 controls
  4. Governance Review Policy (collapsed) - ~6 controls
  5. Repository Selection (expanded) - 8 checkboxes

**Total**: ~43 controls when all expanded

## Issues Identified

### 1. **Screen Real Estate**
- 50/50 split is too tight for the amount of content
- Preview area (right) is underutilized when parameters are expanded
- Left column feels cramped with all sections expanded

### 2. **Visual Hierarchy**
- All sections look equally important
- No clear "start here" guidance
- Collapsed sections might be missed

### 3. **Scrolling Behavior**
- Left column scrolls independently
- Preview scrolls independently
- Can lose context when scrolling

### 4. **Mobile Experience**
- Stacks vertically (good)
- But all content in one long scroll (could be overwhelming)

## Recommendations

### Option A: Adjust Column Ratio (Quick Fix)
- Change to **60/40** or **55/45** (favor parameters)
- Make preview sticky on scroll
- Better use of vertical space

### Option B: Tabbed Parameters (Better Organization)
- Group parameters into tabs:
  - **Basic** (Tiers 1-3, Repositories) - Most common
  - **Advanced** (Tiers 4-5, Economic Nodes, Teams)
  - **Policy** (Governance Review)
- Reduces visible content at once
- Clearer mental model

### Option C: Accordion with Smart Defaults
- Keep collapsible sections
- Add "Quick Start" mode (only essential controls)
- "Advanced" toggle to show all
- Better progressive disclosure

### Option D: Side-by-Side with Sticky Preview (Best UX)
- 60/40 split
- Preview stays visible while scrolling parameters
- Preview updates in real-time
- Best of both worlds

## Recommended Solution: **Option D + Option C Hybrid**

1. **Change layout to 60/40** (parameters/preview)
2. **Make preview sticky** (position: sticky, top: 2rem)
3. **Add "Quick Start" mode** toggle
   - Quick Start: Only Tiers 1-3 + Repositories
   - Advanced: All sections
4. **Better visual indicators**
   - Highlight "most commonly changed" sections
   - Show section completion status
   - Add tooltips for complex parameters

## Implementation Priority

1. **High Priority**: Adjust column ratio + sticky preview
2. **Medium Priority**: Quick Start mode toggle
3. **Low Priority**: Visual indicators and tooltips










