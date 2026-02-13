# Ruiru Media House Enhancement Plan

## Phase 1: The Foundation (Structural Layout)
- [x] Clean up duplicated HTML in src/index.html
- [x] Define clear containers for Queen (header), Prince (player), and Subjects (playlist)
- [x] Update src/style.css for fixed Queen and Prince, scrollable Subjects, rounded borders, professional gaps
- [x] Ensure mobile stacks vertically, desktop splits 70/30
- [x] Update src/script.js for dynamic margin adjustments on mobile

## Phase 2: The Joker's Mirror (Settings Design)
- [x] Enhance Joker screen in src/index.html with 80/20 split (left action area, right command sidebar)
- [x] Update src/style.css for split layout overlay
- [x] Modify src/script.js to populate action area based on commands (Profile, Customization, Security)

## Phase 3: The Customization Studio (Live Preview)
- [x] Add 50/50 split in Customization sub-page for controls and live mirror
- [x] Update src/style.css for studio split and instant reflection
- [x] Update src/script.js for real-time mirror updates on control changes

## Phase 4: The Architect Mode (Stretching & Dragging)
- [ ] Integrate drag-and-drop library (e.g., SortableJS via CDN)
- [ ] Add resize handles and visual indicators in src/style.css
- [ ] Update src/script.js for resizing and drag logic, position tracking

## Phase 5: The Eternal Memory (Individual Saves)
- [ ] Modify src/script.js to track and save widths/heights/positions to localStorage
- [ ] Add logic to load saved settings on page load
- [ ] Ensure compatibility with Firebase auth for user-specific saves

## Followup Steps
- [ ] Update README.md with new features
- [ ] Test responsive layout and functionality
