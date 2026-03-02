// --- Firebase Configuration and Initialization ---
// IMPORTANT: This is your specific project's connection details.
const firebaseConfig = {
    apiKey: "AIzaSyD_AnGX-RO7zfM_rCBopJmdv3BOVE4V-_o",
    authDomain: "media-app-a702b.firebaseapp.com",
    projectId: "media-app-a702b",
    storageBucket: "media-app-a702b.firebasestorage.app",
    messagingSenderId: "60484045851",
    appId: "1:60484045851:web:f1bb588c2d5edc177ffcbe",
    measurementId: "G-LPBXF7MLWF"
};

// ADMIN EMAIL - Change this to your admin email address
// In production, store this in Vercel environment variables as ADMIN_EMAIL
const ADMIN_EMAIL = "admin@example.com"; // Replace with your actual admin email

// Import Firebase functions from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

// Initialize Firebase app and Firestore database instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const contentCollectionRef = collection(db, "content_items");

async function initializeAuthSessionPersistence() {
    try {
        await setPersistence(auth, browserLocalPersistence);
    } catch (e) {
        console.warn('Failed to enforce Firebase auth persistence:', e);
    }
}
const authPersistenceReady = initializeAuthSessionPersistence();

// --- Admin Configuration ---
const SETTINGS_DOC_ID = "app_settings"; // Single document for app settings

/**
 * Sign in with Google
 * Uses Firebase Auth with GoogleAuthProvider
 * Automatically creates account on first login
 */
async function signInWithGoogle() {
    try {
        await authPersistenceReady;
        const provider = new GoogleAuthProvider();
        // Use default Google scopes for authentication only.
        provider.setCustomParameters({ prompt: 'select_account' });

        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        await loadProfileFromBackend(user);
        
        console.log('Google sign-in successful:', user.email);
        
        // Return success
        return { success: true, message: `Welcome, ${user.displayName || user.email}!` };
    } catch (error) {
        if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request') {
            try {
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                await signInWithRedirect(auth, provider);
                return { success: true, redirecting: true, message: 'Redirecting to Google sign-in...' };
            } catch (redirectError) {
                console.error('Google sign-in redirect error:', redirectError);
                return { success: false, message: getAuthErrorMessage(redirectError?.code, redirectError?.message) };
            }
        }
        console.error('Google sign-in error:', error);
        return { success: false, message: getAuthErrorMessage(error?.code, error?.message) };
    }
}

function getAuthErrorMessage(errorCode, fallbackMessage) {
    const map = {
        'auth/invalid-email': 'Invalid email address format.',
        'auth/user-not-found': 'No account found with that email.',
        'auth/wrong-password': 'Invalid email or password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/email-already-in-use': 'This email is already registered. Please login instead.',
        'auth/weak-password': 'Password should be at least 6 characters.',
        'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
        'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
        'auth/operation-not-allowed': 'Email/Password sign-in is disabled in Firebase Authentication settings.',
        'auth/configuration-not-found': 'Authentication configuration is incomplete in Firebase project settings.',
        'auth/popup-closed-by-user': 'Google sign-in popup was closed before completing sign-in.',
        'auth/popup-blocked': 'Popup blocked by browser. Allow popups for this site.',
        'auth/cancelled-popup-request': 'Sign-in popup request was cancelled. Try again.',
        'auth/unauthorized-domain': 'Current domain is not authorized in Firebase Authentication settings.'
    };
    return map[errorCode] || fallbackMessage || 'Authentication failed. Please try again.';
}

/**
 * Sign out user
 */
async function signOutUser() {
    try {
        await signOut(auth);
        console.log('User signed out');
        return { success: true, message: 'Signed out successfully' };
    } catch (error) {
        console.error('Sign out error:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Check if the current user is the admin
 * @returns {Promise<boolean>} True if user is admin, false otherwise
 */
async function isCurrentUserAdmin() {
    const user = auth.currentUser;
    if (!user || !user.email) {
        return false;
    }
    return user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * Check if YouTube sync has been completed
 * @returns {Promise<boolean>} True if sync is completed
 */
async function isYouTubeSyncCompleted() {
    try {
        const settingsDoc = await getDoc(doc(db, "settings", SETTINGS_DOC_ID));
        if (settingsDoc.exists()) {
            return settingsDoc.data().youtubeSyncCompleted === true;
        }
        return false;
    } catch (error) {
        console.error("Error checking sync status:", error);
        return false;
    }
}

/**
 * Mark YouTube sync as completed in Firestore
 */
async function markYouTubeSyncCompleted() {
    try {
        await setDoc(doc(db, "settings", SETTINGS_DOC_ID), {
            youtubeSyncCompleted: true,
            syncCompletedAt: new Date()
        }, { merge: true });
        console.log("YouTube sync marked as completed");
    } catch (error) {
        console.error("Error marking sync as completed:", error);
    }
}

/**
 * Check if the Connect YouTube button should be visible
 * Requirements:
 * 1. User must be logged in as admin
 * 2. YouTube sync must NOT be completed yet
 * @returns {Promise<boolean>}
 */
async function shouldShowConnectYouTubeButton() {
    const isAdmin = await isCurrentUserAdmin();
    const syncCompleted = await isYouTubeSyncCompleted();
    
    return isAdmin && !syncCompleted;
}

/**
 * Update the visibility of the Connect YouTube button
 */
async function updateConnectYouTubeButtonVisibility() {
    const connectBtn = document.getElementById("connectYoutube");
    const btnContainer = document.querySelector(".youtube-btn-container");
    
    if (!connectBtn || !btnContainer) return;
    
    const shouldShow = await shouldShowConnectYouTubeButton();
    
    if (shouldShow) {
        btnContainer.style.display = "block";
    } else {
        btnContainer.style.display = "none";
    }
}

// --- Global Variables and DOM Elements ---
let activeSection = 'home';
let currentSearchTerm = '';
let currentFilterDate = null; // Stores the selected date filter (YYYY-MM-DD)
let autoplayEnabled = true; // Auto-play next video in playlist
let currentPlaylist = []; // Store current playlist items

/**
 * Pause all playing media on the page (HTML5 video/audio and YouTube iframes).
 * This is called when navigation changes to ensure media stops when leaving a page.
 */
function pauseAllMedia() {
    // Pause native media elements
    document.querySelectorAll('video, audio').forEach(m => {
        try { m.pause(); } catch (e) { /* ignore */ }
    });

    // Post a pause command to YouTube iframes that have enablejsapi enabled
    document.querySelectorAll('iframe').forEach(iframe => {
        try {
            const src = iframe.src || '';
            if (src.includes('youtube.com/embed')) {
                // Send pause command via postMessage for YouTube Player API
                iframe.contentWindow && iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
                // Ensure the iframe won't autoplay again by removing autoplay param if present
                try {
                    if (iframe.src && iframe.src.indexOf('autoplay=1') !== -1) {
                        iframe.src = iframe.src.replace('autoplay=1', 'autoplay=0');
                        iframe.setAttribute('data-autoplay-disabled', '1');
                    }
                } catch (e) { /* ignore potential security exceptions */ }
            }
        } catch (e) { /* ignore cross-origin issues gracefully */ }
    });
}

function hideJokerOverlay() {
    const jokerScreen = document.getElementById('joker-screen');
    const settingsGear = document.getElementById('settingsGear');
    if (!jokerScreen) return;
    jokerScreen.setAttribute('aria-hidden', 'true');
    jokerScreen.style.display = 'none';
    document.body.style.overflow = '';
    settingsGear && settingsGear.focus();
}

function showProfileAfterAuthSuccess(message) {
    if (message) {
        alert(message);
    }

    const desktopProfileBtn = document.querySelector('.joker-cmd[data-action="profile"]');
    if (desktopProfileBtn) {
        desktopProfileBtn.click();
        return;
    }

    const mobileProfileBtn = document.querySelector('.joker-mobile-icon-container[data-action="profile"]');
    if (mobileProfileBtn) {
        mobileProfileBtn.click();
        return;
    }

    // Fallback: render profile directly if menu buttons are not available.
    const jokerActionArea = document.getElementById('jokerActionArea');
    if (!jokerActionArea) return;
    jokerActionArea.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'joker-action joker-action-profile';
    container.appendChild(renderProfileSection());
    jokerActionArea.appendChild(container);
}

/**
 * Returns the DOM element that should host the persistent fixed player.
 * Falls back to section-scoped containers if the fixed container isn't present.
 */
function getPlayerContainer() {
    // Use the section-scoped main player view as the persistent player container
    const mainPlayerView = document.getElementById('mainPlayerView');
    if (mainPlayerView) return mainPlayerView;
    // Fallback to hero player
    const hero = document.getElementById('heroPlayerContent');
    if (hero) return hero;
    return null;
}

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const sidebarWrapper = document.querySelector('.sidebar-wrapper');
    const menuToggle = document.querySelector('.menu-toggle');
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');
    const searchInput = document.getElementById('searchInput');
    const eventDateFilterInput = document.getElementById('eventDateFilter');
    const clearDateFilterButton = document.getElementById('clearDateFilter');
    const mainHeader = document.querySelector('.main-header');
    const mainContentWrapper = document.querySelector('.main-content-wrapper');

    // --- Mobile Hamburger Menu Toggle ---
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    function toggleSidebar() {
        sidebarWrapper.classList.toggle('active');
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('active');
        }
    }
    
    function closeSidebar() {
        sidebarWrapper.classList.remove('active');
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('active');
        }
    }
    
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
    
    // Close sidebar when clicking nav items on mobile
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                closeSidebar();
            }
        });
    });

    // --- Joker (Settings) overlay logic (full-screen split) ---
    const settingsGear = document.getElementById('settingsGear');
    const jokerScreen = document.getElementById('joker-screen');
    const jokerBackPortal = document.getElementById('jokerBackPortal');
    const jokerBackPortalMobile = document.getElementById('jokerBackPortalMobile');
    const jokerActionArea = document.getElementById('jokerActionArea');

    function showJoker() {
        if (!jokerScreen) return;
        jokerScreen.setAttribute('aria-hidden', 'false');
        jokerScreen.style.display = 'block';
        // lock background scroll
        document.body.style.overflow = 'hidden';
        pauseAllMedia();
    }
    function hideJoker() {
        if (!jokerScreen) return;
        jokerScreen.setAttribute('aria-hidden', 'true');
        jokerScreen.style.display = 'none';
        document.body.style.overflow = '';
        settingsGear && settingsGear.focus();
    }

    settingsGear && settingsGear.addEventListener('click', (e) => {
        e.preventDefault();
        showJoker();
    });
    
    // Desktop back button
    jokerBackPortal && jokerBackPortal.addEventListener('click', (e) => {
        e.preventDefault();
        hideJoker();
    });
    
    // Mobile back button
    jokerBackPortalMobile && jokerBackPortalMobile.addEventListener('click', (e) => {
        e.preventDefault();
        hideJoker();
    });

    // Commands in Joker overlay (right-side buttons)
    document.querySelectorAll('.joker-cmd[data-action]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const action = ev.currentTarget.dataset.action;
            settingsState.currentAction = action;
            updateJokerMenu(ev.currentTarget);
            renderJokerDetails(action);
        });
    });

    // Mobile icon row click handlers
    document.querySelectorAll('.joker-mobile-icon-container[data-action]').forEach(icon => {
        icon.addEventListener('click', (ev) => {
            const action = ev.currentTarget.dataset.action;
            settingsState.currentAction = action;
            
            // Sync desktop buttons
            const desktopBtn = document.querySelector(`.joker-cmd[data-action="${action}"]`);
            updateJokerMenu(desktopBtn);
            
            // Render details
            renderJokerDetails(action);
        });
    });

    function clearJokerDetails() {
        if (!jokerActionArea) return;
        jokerActionArea.innerHTML = '';
    }

    // Joker Details Renderer (main function)
    function renderJokerDetails(action) {
        if (!jokerActionArea) return;
        clearJokerDetails();
        
        const container = document.createElement('div');
        container.className = 'joker-action ' + 'joker-action-' + action;
        
        switch(action) {
            case 'profile':
                container.appendChild(renderProfileSection());
                break;
            case 'customization':
                container.appendChild(renderCustomizationSection());
                break;
            case 'security':
                container.appendChild(renderSecuritySection());
                break;
            case 'login':
            case 'register':
                renderAuthForm(container, action);
                break;
            default:
                container.innerHTML = '<h2><i class="fas fa-cog"></i> Settings</h2><p>Select an option from the menu.</p>';
        }
        
        jokerActionArea.appendChild(container);
    }
    
    // Fallback auth form for when main renderer isn't loaded
    function renderAuthFormFallback(action) {
        if (!jokerActionArea) return;
        clearJokerDetails();
        const container = document.createElement('div');
        container.className = 'joker-action ' + 'joker-action-' + action;
        
        const fieldEmail = document.createElement('div');
        fieldEmail.className = 'field';
        const lblEmail = document.createElement('label'); lblEmail.textContent = 'Enter email';
        const inpEmail = document.createElement('input'); inpEmail.type = 'email'; inpEmail.name = 'email'; inpEmail.id = 'joker-email'; inpEmail.autocomplete = 'email'; inpEmail.placeholder = 'your@email.com';
        fieldEmail.appendChild(lblEmail); fieldEmail.appendChild(inpEmail);

        const fieldUser = document.createElement('div');
        fieldUser.className = 'field';
        const lblUser = document.createElement('label'); lblUser.textContent = 'Enter username';
        const inpUser = document.createElement('input'); inpUser.type = 'text'; inpUser.name = 'username'; inpUser.id = 'joker-username'; inpUser.autocomplete = 'username'; inpUser.placeholder = 'username';
        fieldUser.appendChild(lblUser); fieldUser.appendChild(inpUser);

        const fieldPass = document.createElement('div');
        fieldPass.className = 'field';
        const lblPass = document.createElement('label'); lblPass.textContent = 'Enter password';
        const inpPass = document.createElement('input'); inpPass.type = 'password'; inpPass.name = 'password'; inpPass.id = 'joker-password'; inpPass.autocomplete = 'new-password'; inpPass.placeholder = 'password';
        fieldPass.appendChild(lblPass); fieldPass.appendChild(inpPass);

        container.appendChild(fieldEmail);
        container.appendChild(fieldUser);
        container.appendChild(fieldPass);
        
        const submit = document.createElement('button'); 
        submit.textContent = action === 'login' ? 'Login' : 'Register';
        submit.className = 'joker-submit';
        submit.addEventListener('click', (e) => { e.preventDefault(); alert('Please wait for page to fully load...'); });
        
        container.appendChild(submit);
        jokerActionArea.appendChild(container);
    }

    // --- Registration Modal Function ---
    function showRegistrationModal(isSuccess, message) {
        const modal = document.getElementById('registration-modal');
        const modalIcon = document.getElementById('registration-modal-icon');
        const modalTitle = document.getElementById('registration-modal-title');
        const modalMessage = document.getElementById('registration-modal-message');
        const modalClose = document.getElementById('registration-modal-close');
        
        if (!modal || !modalIcon || !modalTitle || !modalMessage || !modalClose) {
            // Fallback alert if modal elements not found
            alert((isSuccess ? 'Success: ' : 'Error: ') + message);
            return;
        }
        
        // Set modal content
        modalIcon.className = 'registration-modal-icon ' + (isSuccess ? 'success' : 'error');
        modalTitle.textContent = isSuccess ? 'Registration Successful!' : 'Registration Failed';
        modalMessage.textContent = message;
        
        // Show modal
        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'flex';
        
        // Close modal on button click
        modalClose.onclick = () => {
            modal.setAttribute('aria-hidden', 'true');
            modal.style.display = 'none';
            
            // If registration was successful, close joker screen and switch to login
            if (isSuccess) {
                hideJoker();
                // Switch to login action
                const loginBtn = document.querySelector('.joker-cmd[data-action="login"]');
                if (loginBtn) {
                    loginBtn.click();
                }
            }
        };
        
        // Close modal on overlay click
        const overlay = modal.querySelector('.registration-modal-overlay');
        if (overlay) {
            overlay.onclick = modalClose.onclick;
        }
    }

    // --- Navigation and Content Switching Logic ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Pause any playing media immediately when navigating
            pauseAllMedia();
            const targetSectionId = e.currentTarget.dataset.section + '-section';
            const targetSectionName = e.currentTarget.dataset.section;

            activeSection = targetSectionName;
            searchInput.value = ''; // Clear search input visually
            currentSearchTerm = ''; // Reset search term state
            eventDateFilterInput.value = ''; // Clear date filter visually
            currentFilterDate = null; // Reset date filter state
            clearDateFilterButton.style.display = 'none'; // Hide clear button

            // Update active navigation item
            navItems.forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // Show/hide content sections
            contentSections.forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
                // Auto-close sidebar on mobile after selection
                if (window.innerWidth <= 768 && sidebarWrapper.classList.contains('active')) {
                    sidebarWrapper.classList.remove('active');
                }
            }

            // Load content for the selected section
            if (activeSection === 'home') {
                loadHomeVideos();
            } else {
                loadContentFirebase(activeSection, currentSearchTerm, currentFilterDate);
            }
        });
    });

    // --- Search Functionality ---
    searchInput.addEventListener('input', () => {
        currentSearchTerm = searchInput.value.trim();
        if (activeSection !== 'home') {
            loadContentFirebase(activeSection, currentSearchTerm, currentFilterDate);
        }
    });

    // --- Event Date Filter Functionality ---
    eventDateFilterInput.addEventListener('change', (e) => {
        currentFilterDate = e.target.value; // YYYY-MM-DD format
        if (currentFilterDate) {
            clearDateFilterButton.style.display = 'inline-flex'; // Show clear button
        } else {
            clearDateFilterButton.style.display = 'none'; // Hide clear button
        }

        if (activeSection !== 'home') {
            loadContentFirebase(activeSection, currentSearchTerm, currentFilterDate);
        }
    });

    clearDateFilterButton.addEventListener('click', () => {
        eventDateFilterInput.value = '';
        currentFilterDate = null;
        clearDateFilterButton.style.display = 'none';
        if (activeSection !== 'home') {
            loadContentFirebase(activeSection, currentSearchTerm, currentFilterDate);
        }
    });

    // --- Dynamic Header Height Adjustment for Mobile (to prevent content overlap) ---
    const adjustMainContentMargin = () => {
        if (window.innerWidth <= 768) {
            // Calculate actual height of the main header
            const headerHeight = mainHeader.offsetHeight;
            mainContentWrapper.style.marginTop = `${headerHeight}px`;
        } else {
            mainContentWrapper.style.marginTop = ''; // Reset for desktop
        }
    };

    // Adjust on load and resize
    adjustMainContentMargin();
    window.addEventListener('resize', adjustMainContentMargin);

    // Initialize draggable resizers for desktop
    initResizers();


    // --- Initial Page Load ---
    // Simulate clicking the home nav item to load initial content
    const initialNavItem = document.querySelector('.nav-item[data-section="home"]');
    if (initialNavItem) {
        initialNavItem.click();
    }
    // Also ensure home videos are loaded on initial load
    loadHomeVideos();
    
    // Initialize autoplay functionality
    initializeAutoplay();
    
    // Initialize Joker Settings (Phase 2-5)
    initJokerSettings();
});

// --- Resizer Logic ---
function initResizers() {
    // Only enable on desktop sizes
    if (window.innerWidth <= 768) return;

    const colResizer = document.getElementById('colResizer');
    const rowResizer = document.getElementById('rowResizer');
    const theater = document.getElementById('theaterContainer');
    const playerCol = document.querySelector('.player-column');
    const playlist = document.querySelector('.video-playlist-sidebar');
    const player = document.querySelector('.main-player-view');

    if (colResizer && theater && playerCol && playlist) {
        let dragging = false;
        let startX = 0;
        let startPlayerWidth = 0;
        const minPlayerPx = 360; // min width
        const minPlaylistPx = 240; // min playlist width

        const onMove = (clientX) => {
            const rect = theater.getBoundingClientRect();
            const containerWidth = rect.width;
            let newPlayerWidth = clientX - rect.left;
            // clamp
            newPlayerWidth = Math.max(minPlayerPx, Math.min(containerWidth - minPlaylistPx - 10, newPlayerWidth));
            // apply as flex-basis to player column
            playerCol.style.flex = `0 0 ${newPlayerWidth}px`;
            // playlist will take remaining space (flex-basis set)
            const playlistWidth = containerWidth - newPlayerWidth - 10; // 10px for resizer
            playlist.style.flex = `0 0 ${playlistWidth}px`;
        };

        const startDrag = (e) => {
            dragging = true;
            startX = (e.touches ? e.touches[0].clientX : e.clientX);
            startPlayerWidth = playerCol.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', colMouseMove);
            window.addEventListener('touchmove', colTouchMove, { passive: false });
            window.addEventListener('mouseup', stopColDrag);
            window.addEventListener('touchend', stopColDrag);
        };

        const colMouseMove = (ev) => { if (!dragging) return; ev.preventDefault(); onMove(ev.clientX); };
        const colTouchMove = (ev) => { if (!dragging) return; ev.preventDefault(); onMove(ev.touches[0].clientX); };

        const stopColDrag = () => {
            dragging = false;
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', colMouseMove);
            window.removeEventListener('touchmove', colTouchMove);
            window.removeEventListener('mouseup', stopColDrag);
            window.removeEventListener('touchend', stopColDrag);
        };

        colResizer.addEventListener('mousedown', startDrag);
        colResizer.addEventListener('touchstart', startDrag, { passive: true });
    }

    if (rowResizer && player) {
        let draggingH = false;
        let startY = 0;
        let startPlayerH = 0;
        let startDetailsH = 0;
        const minPlayerH = 160;
        const minDetailsH = 60;
        const maxSumH = Math.round(window.innerHeight * 0.9);

        const onMoveH = (clientY) => {
            const delta = clientY - startY; // positive when dragging down
            let newTotal = startPlayerH + startDetailsH + delta;
            newTotal = Math.max(minPlayerH + minDetailsH, Math.min(maxSumH, newTotal));
            const scale = newTotal / (startPlayerH + startDetailsH);
            let newPlayer = Math.max(minPlayerH, Math.round(startPlayerH * scale));
            let newDetails = Math.max(minDetailsH, Math.round(startDetailsH * scale));
            // clamp to ensure sum equals newTotal (adjust rounding error)
            const sumNow = newPlayer + newDetails;
            if (sumNow !== newTotal) {
                const diff = newTotal - sumNow;
                newPlayer += diff; // bias to player for visibility
            }
            document.documentElement.style.setProperty('--prince-height', `${newPlayer}px`);
            document.documentElement.style.setProperty('--player-details-height', `${newDetails}px`);
        };

        const startDragH = (e) => {
            draggingH = true;
            startY = (e.touches ? e.touches[0].clientY : e.clientY);
            startPlayerH = player.getBoundingClientRect().height;
            const detailsEl = document.getElementById('playerDetails');
            startDetailsH = detailsEl ? detailsEl.getBoundingClientRect().height : 120;
            document.body.style.userSelect = 'none';
            rowResizer.classList.add('active');
            window.addEventListener('mousemove', rowMouseMove);
            window.addEventListener('touchmove', rowTouchMove, { passive: false });
            window.addEventListener('mouseup', stopRowDrag);
            window.addEventListener('touchend', stopRowDrag);
        };

        const rowMouseMove = (ev) => { if (!draggingH) return; ev.preventDefault(); onMoveH(ev.clientY); };
        const rowTouchMove = (ev) => { if (!draggingH) return; ev.preventDefault(); onMoveH(ev.touches[0].clientY); };

        const stopRowDrag = () => {
            draggingH = false;
            document.body.style.userSelect = '';
            rowResizer.classList.remove('active');
            window.removeEventListener('mousemove', rowMouseMove);
            window.removeEventListener('touchmove', rowTouchMove);
            window.removeEventListener('mouseup', stopRowDrag);
            window.removeEventListener('touchend', stopRowDrag);
        };

        // Double-click toggles details position (top/bottom)
        rowResizer.addEventListener('dblclick', (ev) => {
            const playerColEl = document.querySelector('.player-column');
            if (!playerColEl) return;
            playerColEl.classList.toggle('details-top');
        });

        rowResizer.addEventListener('mousedown', startDragH);
        rowResizer.addEventListener('touchstart', startDragH, { passive: true });
    }
}

// Keep track of original welcome position so we can restore it
const _welcomeOriginal = { parent: null, next: null };

function moveWelcomeIntoBoundary() {
    const welcome = document.querySelector('.welcome-card');
    const wrapper = document.getElementById('boundaryWelcomeWrapper');
    if (!welcome || !wrapper) return;
    if (!_welcomeOriginal.parent) {
        _welcomeOriginal.parent = welcome.parentNode;
        _welcomeOriginal.next = welcome.nextSibling;
    }
    // move the welcome card into the boundary wrapper
    wrapper.innerHTML = '';
    wrapper.appendChild(welcome);
}

function restoreWelcomeFromBoundary() {
    const welcome = document.querySelector('.welcome-card');
    if (!welcome || !_welcomeOriginal.parent) return;
    // move it back to its original location
    _welcomeOriginal.parent.insertBefore(welcome, _welcomeOriginal.next);
    _welcomeOriginal.parent = null;
    _welcomeOriginal.next = null;
}

/**
 * Loads all videos for the home page (no category filter), sorted by timestamp (newest first).
 */
function loadHomeVideos() {
    const grid = document.getElementById('homeVideoGrid');
    const theater = document.getElementById('theaterContainer');
    const mainPlayer = document.getElementById('mainPlayerView');
    const playlistGrid = document.getElementById('playlistGrid');

    if (!grid) return;
    grid.innerHTML = '<p class="text-center-message">Loading videos...</p>';

    // Listen for all documents in the collection
    onSnapshot(contentCollectionRef, (snapshot) => {
        let docs = [];
        snapshot.forEach(docSnap => docs.push({ id: docSnap.id, data: docSnap.data() }));

        // Filter out archived similarly to other loaders
        let relevant = docs.filter(d => (d.data.isArchived === false || d.data.isArchived === undefined));

        // Sort by timestamp desc
        relevant.sort((a, b) => {
            const ta = a.data.timestamp ? a.data.timestamp.toDate() : new Date(0);
            const tb = b.data.timestamp ? b.data.timestamp.toDate() : new Date(0);
            return tb - ta;
        });

        grid.innerHTML = '';
        playlistGrid && (playlistGrid.innerHTML = '');

        if (relevant.length === 0) {
            grid.innerHTML = '<p class="text-center-message">No videos available.</p>';
            return;
        }

        relevant.forEach((docItem, idx) => {
            const thumb = renderHomeThumbnail(docItem);
            thumb.addEventListener('click', () => {
                // Open theater using the persistent fixed player and scrollable playlist
                openTheaterWithVideo(docItem, relevant);
            });
            grid.appendChild(thumb);
        });
    }, (err) => {
        console.error('Error loading home videos:', err);
        grid.innerHTML = '<p class="text-center-message">Error loading videos.</p>';
    });
}

/**
 * Open a Split Theater layout: left large sticky player (75vw), right scrollable playlist (25vw).
 */
function openSplitTheater(selectedDoc, allDocs) {
    const homeSection = document.getElementById('home-section');
    const grid = document.getElementById('homeVideoGrid');
    const welcomeCard = document.querySelector('.welcome-card');

    if (!homeSection || !grid) return;

    // Remove existing theater-mode if present
    const existing = document.querySelector('.theater-mode');
    if (existing) existing.remove();

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'theater-mode';

    const mainPlayer = document.createElement('div');
    mainPlayer.className = 'main-player';
    mainPlayer.id = 'splitMainPlayer';

    const sidebarList = document.createElement('div');
    sidebarList.className = 'sidebar-list';
    sidebarList.id = 'splitSidebarList';

    wrapper.appendChild(mainPlayer);
    wrapper.appendChild(sidebarList);

    // Insert wrapper before the grid so it appears above/beside it
    homeSection.insertBefore(wrapper, grid);

    // Hide welcome card and grid (grid thumbnails will be shown in playlist-right)
    if (welcomeCard) welcomeCard.style.display = 'none';
    grid.style.display = 'none';

    // Add close button to main player
    const closeBtn = createCloseButton('Close');
    closeBtn.addEventListener('click', () => {
        // remove theater
        wrapper.remove();
        // restore welcome and grid
        if (welcomeCard) welcomeCard.style.display = '';
        grid.style.display = '';
        // slight scroll to top of restored grid
        setTimeout(() => { window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY - (document.querySelector('.main-header') ? document.querySelector('.main-header').offsetHeight : 0) - 8, behavior: 'smooth' }); }, 40);
    });
    mainPlayer.appendChild(closeBtn);

    // Populate main player with selected
    populateSplitPlayer(selectedDoc, mainPlayer);

    // Populate sidebar with remaining videos
    sidebarList.innerHTML = '';
    allDocs.forEach(doc => {
        if (doc.id === selectedDoc.id) return;
        const item = renderPlaylistThumb(doc);
        item.classList.add('sidebar-item');
        item.addEventListener('click', () => {
            populateSplitPlayer(doc, mainPlayer);
            // on mobile ensure player is visible
            setTimeout(() => {
                const headerOffset = document.querySelector('.main-header') ? document.querySelector('.main-header').offsetHeight : 0;
                const topPos = mainPlayer.getBoundingClientRect().top + window.scrollY - headerOffset - 8;
                window.scrollTo({ top: topPos, behavior: 'smooth' });
            }, 40);
        });
        sidebarList.appendChild(item);
    });

    // Ensure playlist can scroll vertically (CSS handles overflow-y)

    // Scroll to top so the player-left is visible
    setTimeout(() => {
        const headerOffset = document.querySelector('.main-header') ? document.querySelector('.main-header').offsetHeight : 0;
        const topPos = wrapper.getBoundingClientRect().top + window.scrollY - headerOffset - 8;
        window.scrollTo({ top: topPos, behavior: 'smooth' });
    }, 60);
}

function renderPlaylistThumb(docItem) {
    const item = docItem.data;
    const container = document.createElement('div');
    container.className = 'sidebar-item';

    const ytId = item.url ? getYouTubeVideoId(item.url) : null;
    const thumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : (item.thumbnailUrl || 'https://via.placeholder.com/320x180.png?text=No+Thumb');

    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'sidebar-thumb';
    thumbDiv.innerHTML = `<img src="${thumb}" alt="${item.title || 'Video'}" loading="lazy">`;

    const textDiv = document.createElement('div');
    textDiv.className = 'sidebar-text';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title || 'Untitled';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = item.category ? item.category : (item.eventDate ? new Date(item.eventDate).toLocaleDateString() : (item.by || ''));

    textDiv.appendChild(title);
    textDiv.appendChild(meta);

    container.appendChild(thumbDiv);
    container.appendChild(textDiv);
    return container;
}

function populateSplitPlayer(docItem, containerEl) {
    const item = docItem.data;
    // Prefer the global fixed player if available, unless a specific container is provided
    const target = containerEl || getPlayerContainer();
    if (!target) return;
    target.innerHTML = '';

    const ytId = item.url ? getYouTubeVideoId(item.url) : null;
    if (ytId) {
        const iframe = document.createElement('iframe');
        const origin = encodeURIComponent(window.location && window.location.origin ? window.location.origin : '');
        iframe.src = `https://www.youtube.com/embed/${ytId}?rel=0&enablejsapi=1&origin=${origin}&autoplay=1`;
        iframe.setAttribute('data-yt-id', ytId);
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        target.appendChild(iframe);
    } else if (item.url && item.url.match(/\.(mp4|webm|ogg)$/i)) {
        const video = document.createElement('video');
        video.src = item.url;
        video.controls = true; 
        video.autoplay = true;
        video.playsInline = true;
        video.style.width = '100%';
        video.style.height = '100%';
        target.appendChild(video);
    } else if (item.url && item.url.match(/\.(mp3|wav|aac)$/i)) {
        const audioWrap = document.createElement('div');
        audioWrap.style.padding = '12px';
        const audio = document.createElement('audio');
        audio.src = item.url;
        audio.controls = true;
        audio.autoplay = true;
        audioWrap.appendChild(audio);
        target.appendChild(audioWrap);
    } else if (item.url && item.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.title || '';
        img.style.width = '100%';
        img.style.height = 'auto';
        target.appendChild(img);
    } else {
        target.innerHTML = `<div style="padding:20px;color:#fff;">Unable to play this content.</div>`;
    }
    // If a global player details area exists (desktop), populate title + description there
    try {
        const details = document.getElementById('playerDetails');
        if (details) {
            if (window.innerWidth > 768) {
                details.innerHTML = `<h3>${escapeHtml(item.title || 'Untitled')}</h3><p>${escapeHtml(item.description || '')}</p>`;
            } else {
                details.innerHTML = '';
            }
        }
    } catch (e) { /* ignore */ }
}

/**
 * Open the large hero player at the top of the home section with the selected video.
 * Hides the welcome card and scrolls the hero into view. Rebuilds the grid to show remaining videos.
 */
function openHeroWithVideo(selectedDoc, allDocs) {
    const heroContainer = document.getElementById('home-hero-player-container');
    const heroContent = document.getElementById('heroPlayerContent');
    const grid = document.getElementById('homeVideoGrid');
    const welcomeCard = document.querySelector('.welcome-card');

    if (!heroContainer || !heroContent || !grid) return;

    // Show hero, hide welcome card
    heroContainer.style.display = 'block';
    if (welcomeCard) welcomeCard.style.display = 'none';

    // Populate hero
    populateHeroPlayer(selectedDoc);

    // Add close button to hero container
    // remove existing close if present
    const existingClose = heroContainer.querySelector('.theater-close-btn');
    if (existingClose) existingClose.remove();
    const heroClose = createCloseButton('Close');
    heroClose.addEventListener('click', () => {
        // hide hero and restore welcome/grid
        heroContainer.style.display = 'none';
        if (welcomeCard) welcomeCard.style.display = '';
        // reload home videos to ensure grid repopulated
        loadHomeVideos();
        heroContent.innerHTML = '';
        const details = document.getElementById('playerDetails'); if (details) details.innerHTML = '';
    });
    heroContainer.appendChild(heroClose);

    // Rebuild grid with remaining videos (exclude selected)
    grid.innerHTML = '';
    allDocs.forEach(doc => {
        if (doc.id === selectedDoc.id) return;
        const thumb = renderHomeThumbnail(doc);
        thumb.addEventListener('click', () => openHeroWithVideo(doc, allDocs));
        grid.appendChild(thumb);
    });

    // Scroll hero into view (accounting for sticky header)
    setTimeout(() => {
        const headerOffset = document.querySelector('.main-header') ? document.querySelector('.main-header').offsetHeight : 0;
        const topPos = heroContainer.getBoundingClientRect().top + window.scrollY - headerOffset - 8;
        window.scrollTo({ top: topPos, behavior: 'smooth' });
    }, 60);
}

function populateHeroPlayer(docItem) {
    const heroContent = document.getElementById('heroPlayerContent');
    if (!heroContent) return;
    const item = docItem.data;
    heroContent.innerHTML = '';

    const ytId = item.url ? getYouTubeVideoId(item.url) : null;
    if (ytId) {
        const iframe = document.createElement('iframe');
        const origin = encodeURIComponent(window.location && window.location.origin ? window.location.origin : '');
        iframe.src = `https://www.youtube.com/embed/${ytId}?rel=0&enablejsapi=1&origin=${origin}&autoplay=1`;
        iframe.setAttribute('data-yt-id', ytId);
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        heroContent.appendChild(iframe);
    } else if (item.url && item.url.match(/\.(mp4|webm|ogg)$/i)) {
        const video = document.createElement('video');
        video.src = item.url;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        heroContent.appendChild(video);
    } else if (item.url && item.url.match(/\.(mp3|wav|aac)$/i)) {
        const audioWrap = document.createElement('div');
        audioWrap.style.padding = '12px';
        const audio = document.createElement('audio');
        audio.src = item.url;
        audio.controls = true;
        audio.autoplay = true;
        audioWrap.appendChild(audio);
        heroContent.appendChild(audioWrap);
    } else if (item.url && item.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.title || '';
        heroContent.appendChild(img);
    } else {
        heroContent.innerHTML = `<div style="padding:20px;color:#fff;">Unable to play this content.</div>`;
    }
    // Populate desktop-only player details under the main player if present
    try {
        const details = document.getElementById('playerDetails');
        if (details) {
            if (window.innerWidth > 768) {
                details.innerHTML = `<h3>${escapeHtml(item.title || 'Untitled')}</h3><p>${escapeHtml(item.description || '')}</p>`;
            } else {
                details.innerHTML = '';
            }
        }
    } catch (e) { /* ignore */ }
}

function renderHomeThumbnail(docItem) {
    const item = docItem.data;
    const wrapper = document.createElement('div');
    wrapper.className = 'thumbnail-item';

    // Choose thumbnail: if youtube id, use youtube thumbnail, else try to use url (if image) or placeholder
    let thumbUrl = '';
    const ytId = item.url ? getYouTubeVideoId(item.url) : null;
    if (ytId) {
        thumbUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    } else if (item.thumbnailUrl) {
        thumbUrl = item.thumbnailUrl;
    } else {
        thumbUrl = 'https://via.placeholder.com/480x270.png?text=No+Thumbnail';
    }

    wrapper.innerHTML = `
        <img src="${thumbUrl}" alt="${item.title || 'Video'}" loading="lazy">
        <div class="thumb-meta">
            <strong>${item.title || 'Untitled'}</strong>
            <div class="meta-sub">${item.by ? item.by : ''}</div>
        </div>
    `;
    return wrapper;
}

function openTheaterWithVideo(selectedDoc, allDocs) {
    const theater = document.getElementById('theaterContainer');
    const grid = document.getElementById('homeVideoGrid');
    const playlistGrid = document.getElementById('playlistGrid');

    const welcomeCard = document.querySelector('.welcome-card');

    if (!theater) return;

    // Hide the welcome card and grid, show theater
    if (welcomeCard) welcomeCard.style.display = 'none';
    grid.style.display = 'none';
    theater.style.display = 'flex';

    // Set current playlist for autoplay
    currentPlaylist = allDocs;

    // Use the persistent fixed player container to show the selected video
    const playerContainer = getPlayerContainer();
    if (!playerContainer) return;
    populateMainPlayer(selectedDoc);
    playerContainer.dataset.currentVideoId = selectedDoc.id;

    // Add close button inside the persistent player container
    const existingClose = playerContainer.querySelector('.theater-close-btn');
    if (existingClose) existingClose.remove();
    const closeBtn = createCloseButton('Close');
    closeBtn.addEventListener('click', () => {
        // hide theater and restore grid and welcome card
        theater.style.display = 'none';
        if (grid) grid.style.display = '';
        if (welcomeCard) welcomeCard.style.display = '';
        playerContainer.innerHTML = '';
        const details = document.getElementById('playerDetails'); if (details) details.innerHTML = '';
        currentPlaylist = []; // Clear playlist
    });
    playerContainer.appendChild(closeBtn);

    // Populate sidebar with remaining videos
    if (playlistGrid) {
        playlistGrid.innerHTML = '';
        allDocs.forEach(doc => {
            if (doc.id === selectedDoc.id) return; // skip selected
            const p = renderPlaylistItem(doc);
            p.dataset.videoId = doc.id;
            p.addEventListener('click', () => {
                populateMainPlayer(doc);
                playerContainer.dataset.currentVideoId = doc.id;
                updatePlaylistHighlight(doc.id);
            });
            playlistGrid.appendChild(p);
        });
    }

    // Highlight current video
    updatePlaylistHighlight(selectedDoc.id);

    // Add autoplay toggle to the top of playlist
    addAutoplayToggle();
}

function renderPlaylistItem(docItem) {
    const item = docItem.data;
    const row = document.createElement('div');
    row.className = 'playlist-item';

    const ytId = item.url ? getYouTubeVideoId(item.url) : null;
    const thumb = ytId ? `https://i.ytimg.com/vi/${ytId}/default.jpg` : (item.thumbnailUrl || 'https://via.placeholder.com/120x90.png?text=No+Thumb');

    row.innerHTML = `
        <img src="${thumb}" alt="${item.title}" loading="lazy">
        <div class="playlist-meta">
            <div class="title">${item.title || 'Untitled'}</div>
            <div class="sub">${item.by || ''}</div>
        </div>
    `;
    return row;
}

function populateMainPlayer(docItem) {
    const target = getPlayerContainer();
    if (!target) return;
    const item = docItem.data;
    target.innerHTML = '';

    const ytId = item.url ? getYouTubeVideoId(item.url) : null;
    if (ytId) {
        const iframe = document.createElement('iframe');
        const origin = encodeURIComponent(window.location && window.location.origin ? window.location.origin : '');
        iframe.src = `https://www.youtube.com/embed/${ytId}?rel=0&enablejsapi=1&origin=${origin}&autoplay=1`;
        iframe.setAttribute('data-yt-id', ytId);
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        target.appendChild(iframe);

        // Setup autoplay for YouTube videos
        console.log('Setting up autoplay for YouTube video:', ytId);
        setupAutoplay(iframe, docItem.id);
    } else if (item.url && item.url.match(/\.(mp4|webm|ogg)$/i)) {
        const video = document.createElement('video');
        video.src = item.url;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.style.width = '100%';
        video.style.height = '100%';

        // Setup autoplay for HTML5 videos
        video.addEventListener('ended', () => {
            console.log('HTML5 video ended, autoplay enabled:', autoplayEnabled);
            if (autoplayEnabled) {
                playNextVideo(docItem.id);
            }
        });

        target.appendChild(video);
    } else if (item.url && item.url.match(/\.(mp3|wav|aac)$/i)) {
        const audio = document.createElement('audio');
        audio.src = item.url;
        audio.controls = true;
        audio.autoplay = true;

        // Setup autoplay for audio
        audio.addEventListener('ended', () => {
            console.log('Audio ended, autoplay enabled:', autoplayEnabled);
            if (autoplayEnabled) {
                playNextVideo(docItem.id);
            }
        });

        target.appendChild(audio);
    } else if (item.url && item.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.title || '';
        img.style.width = '100%';
        img.style.height = 'auto';
        target.appendChild(img);
    } else {
        target.innerHTML = `<div style="padding:20px;color:#fff;">Unable to play this content.</div>`;
    }
}

// --- Helper Functions ---

/**
 * Extracts YouTube video ID from various YouTube URL formats.
 * @param {string} url - The YouTube URL.
 * @returns {string|null} The YouTube video ID or null if not found.
 */
function getYouTubeVideoId(url) {
    let videoId = null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)([\w-]{11})(?:\S+)?/;
    const match = url.match(regex);
    if (match && match[1]) {
        videoId = match[1];
    }
    return videoId;
}

// Basic HTML escape to prevent injection when inserting text into details
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"'`=\/]/g, function (s) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;','=':'&#61;','/':'&#47;'})[s];
    });
}

// Create a standardized close button for theater modes
function createCloseButton(label = 'Close') {
    const btn = document.createElement('button');
    btn.className = 'theater-close-btn';
    btn.type = 'button';
    btn.textContent = label;
    return btn;
}

/**
 * Loads and displays content for a specific section from Firestore.
 * Includes search, sorting, and handles compatibility with old documents.
 * @param {string} section - The content category (e.g., 'sermons').
 * @param {string} searchTerm - The search term to filter by.
 * @param {string} [filterDate=null] - Optional date string (YYYY-MM-DD) to filter content by eventDate.
 */
function loadContentFirebase(section, searchTerm = '', filterDate = null) {
    const contentContainer = document.getElementById(`${section}-container`);
    if (!contentContainer) {
        console.warn(`Content container for section "${section}" not found.`);
        return;
    }

    // Clear previous content and show a temporary message
    contentContainer.innerHTML = '<p class="text-center-message">Loading content...</p>';

    // Query for active items in a specific category.
    // We will filter by isArchived status client-side to include old docs.
    let q = query(
        contentCollectionRef,
        where("category", "==", section)
    );

    onSnapshot(q, (snapshot) => {
        let docs = [];
        snapshot.forEach(docSnapshot => {
            docs.push({ id: docSnapshot.id, data: docSnapshot.data() });
        });

        // Client-side filter to include items where isArchived is explicitly false OR undefined (old docs)
        let relevantDocs = docs.filter(docItem => {
            const isArchivedStatus = docItem.data.isArchived;
            return isArchivedStatus === false || isArchivedStatus === undefined;
        });

        // Client-side sorting by timestamp (newest first)
        relevantDocs.sort((a, b) => {
            const tsA = a.data.timestamp ? a.data.timestamp.toDate() : new Date(0);
            const tsB = b.data.timestamp ? b.data.timestamp.toDate() : new Date(0);
            return tsB - tsA; // Descending order
        });

        // Client-side filter for search term
        let filteredDocs = relevantDocs;
        if (searchTerm) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            filteredDocs = filteredDocs.filter(docItem => {
                const item = docItem.data;
                return (item.title && item.title.toLowerCase().includes(lowerSearchTerm)) ||
                       (item.description && item.description.toLowerCase().includes(lowerSearchTerm)) ||
                       (item.topic && item.topic.toLowerCase().includes(lowerSearchTerm)) ||
                       (item.by && item.by.toLowerCase().includes(lowerSearchTerm));
            });
        }

        // Client-side filter for event date
        if (filterDate) {
            filteredDocs = filteredDocs.filter(docItem => {
                const itemEventDate = docItem.data.eventDate; // YYYY-MM-DD string
                return itemEventDate === filterDate;
            });
        }

        contentContainer.innerHTML = ''; // Clear existing content

        if (filteredDocs.length === 0) {
            const message = `No content found in this category${searchTerm ? ` for "${searchTerm}"` : ''}${filterDate ? ` on ${new Date(filterDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}.`;
            contentContainer.innerHTML = `<p class="text-center-message">${message}</p>`;
            return;
        }

        // Group content by event date for display
        const groupedContent = {};
        if (!filterDate) { // Only group by date if no specific date filter is active
            filteredDocs.forEach(docItem => {
                const eventDate = docItem.data.eventDate; // YYYY-MM-DD
                if (eventDate) {
                    if (!groupedContent[eventDate]) {
                        groupedContent[eventDate] = [];
                    }
                    groupedContent[eventDate].push(docItem);
                } else {
                    // Handle items without an eventDate, put them in a 'No Date' category
                    if (!groupedContent['No Date']) {
                        groupedContent['No Date'] = [];
                    }
                    groupedContent['No Date'].push(docItem);
                }
            });

            // Sort dates in descending order
            const sortedDates = Object.keys(groupedContent).sort((a, b) => {
                if (a === 'No Date') return 1; // 'No Date' comes last
                if (b === 'No Date') return -1;
                return new Date(b) - new Date(a);
            });

            sortedDates.forEach(date => {
                const dateHeading = document.createElement('h3');
                dateHeading.classList.add('date-group-heading');
                dateHeading.textContent = date === 'No Date' ? 'Content without a specific date' : new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                contentContainer.appendChild(dateHeading);

                    groupedContent[date].forEach(docItem => {
                        renderContentItem(docItem, contentContainer, { section, list: filteredDocs });
                    });
            });

        } else { // If a specific date is filtered, just render all filtered docs
            filteredDocs.forEach(docItem => {
                renderContentItem(docItem, contentContainer, { section, list: filteredDocs });
            });
        }
        
        // Also populate video grid for theater mode (like home section)
        populateVideoGrid(section, filteredDocs);

    }, (error) => {
        console.error("Error fetching documents from Firestore: ", error);
        contentContainer.innerHTML = '<p class="text-center-message">Error loading content. Please check your internet connection and Firebase rules.</p>';
    });
}

/**
 * Populate video grid for any section (sermons, entertainment, bible-study, events, announcement)
 * Similar to loadHomeVideos but for other sections
 */
function populateVideoGrid(section, docs) {
    const grid = document.getElementById(`${section}VideoGrid`);
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (docs.length === 0) {
        grid.innerHTML = '<p class="text-center-message">No videos available.</p>';
        return;
    }
    
    docs.forEach((docItem) => {
        const thumb = renderHomeThumbnail(docItem);
        thumb.addEventListener('click', () => {
            openTheaterMode(section, docItem, docs);
        });
        grid.appendChild(thumb);
    });
}

/**
 * Renders a single content item into the specified container.
 * @param {Object} docItem - The document object from Firestore ({id, data}).
 * @param {HTMLElement} container - The DOM element to append the content item to.
 */
function renderContentItem(docItem, container, opts = {}) {
    const item = docItem.data;
    const contentItemDiv = document.createElement('div');
    contentItemDiv.classList.add('content-item');

    let mediaContent = '';
    const youtubeId = item.url ? getYouTubeVideoId(item.url) : null;

    if (youtubeId) {
        const originEnc = encodeURIComponent(window.location && window.location.origin ? window.location.origin : '');
        mediaContent = `
            <div class="video-container">
                <iframe
                    src="https://www.youtube.com/embed/${youtubeId}?rel=0&enablejsapi=1&origin=${originEnc}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    title="${item.title || 'YouTube video player'}"
                ></iframe>
            </div>
        `;
    } else if (item.url) {
        // Assume it's a direct file URL from Firebase Storage or another source
        // We can add logic here to differentiate video/audio/image if needed
        if (item.url.match(/\.(mp4|webm|ogg)$/i)) { // Basic video file check
            mediaContent = `<div class="video-container"><video controls src="${item.url}" style="width:100%; height:100%; border-radius:8px;"></video></div>`;
        } else if (item.url.match(/\.(mp3|wav|aac)$/i)) { // Basic audio file check
            mediaContent = `<audio controls src="${item.url}" style="width:100%; margin-top:15px;"></audio>`;
        } else if (item.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) { // Basic image file check
            mediaContent = `<img src="${item.url}" alt="${item.title}" style="width:100%; height:auto; border-radius:8px; margin-top:15px; object-fit: cover;">`;
        } else {
            mediaContent = `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="view-link">View Content Link</a>`;
        }
    }

    contentItemDiv.innerHTML = `
        <h3>${item.title}</h3>
        <p>${item.description || 'No description provided.'}</p>
        <div class="metadata">
            ${item.eventDate ? `<strong>Date:</strong> ${new Date(item.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br>` : ''}
            ${item.eventTime ? `<strong>Time:</strong> ${item.eventTime}<br>` : ''}
            ${item.topic ? `<strong>Topic:</strong> ${item.topic}<br>` : ''}
            ${item.by ? `<strong>By:</strong> ${item.by}<br>` : ''}
        </div>
        ${mediaContent}
    `;
    container.appendChild(contentItemDiv);

    // Attach standardized click handler to open theater mode for this section
    try {
        const sectionName = opts.section || null;
        const listDocs = opts.list || null;
        contentItemDiv.addEventListener('click', (ev) => {
            // Prevent clicks on embedded media from triggering theater
            const tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
            if (['iframe', 'video', 'audio', 'a', 'img', 'button'].includes(tag)) return;
            if (sectionName && listDocs) {
                openTheaterMode(sectionName, docItem, listDocs);
            } else {
                // fallback: open home split theater with this single item
                openSplitTheater(docItem, listDocs || [docItem]);
            }
        });
    } catch (e) {
        console.warn('Failed to attach theater click handler', e);
    }
}

/**
 * Open theater mode scoped to a specific section (e.g., 'sermons').
 * Left: large sticky player (70-75%). Right: YouTube-style sidebar showing only the videos from the provided list.
 */
function openTheaterMode(section, selectedDoc, listDocs) {
    const sectionEl = document.getElementById(`${section}-section`);
    const contentContainer = document.getElementById(`${section}-container`);
    if (!sectionEl || !contentContainer) return;

    // Remove any existing theater-mode inside this section
    const existing = sectionEl.querySelector('.theater-mode');
    if (existing) existing.remove();

    // Create wrapper and parts
    const wrapper = document.createElement('div');
    wrapper.className = 'theater-mode';

    const mainPlayer = document.createElement('div');
    mainPlayer.className = 'main-player';
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar-list';

    wrapper.appendChild(mainPlayer);
    wrapper.appendChild(sidebar);

    // Insert wrapper after welcome-card (if present), otherwise at top
    const welcomeCard = sectionEl.querySelector('.welcome-card');
    if (welcomeCard && welcomeCard.nextSibling) {
        sectionEl.insertBefore(wrapper, welcomeCard.nextSibling);
    } else {
        sectionEl.insertBefore(wrapper, sectionEl.firstChild);
    }

    // Hide the existing content container (we'll show the sidebar list instead)
    contentContainer.style.display = 'none';
    
    // Also hide the video grid when in theater mode
    const videoGrid = sectionEl.querySelector('.home-video-grid');
    if (videoGrid) videoGrid.style.display = 'none';

    // Populate main player with selected
    populateSplitPlayer(selectedDoc, mainPlayer);

    // Populate sidebar with other videos from listDocs
    sidebar.innerHTML = '';
    listDocs.forEach(doc => {
        if (doc.id === selectedDoc.id) return;
        const item = renderPlaylistThumb(doc);
        item.classList.add('sidebar-item');
        item.addEventListener('click', () => {
            // swap into main player
            populateSplitPlayer(doc, mainPlayer);
            // update active highlight
            Array.from(sidebar.querySelectorAll('.sidebar-item')).forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            // ensure player visible on small screens
            setTimeout(() => {
                const headerOffset = document.querySelector('.main-header') ? document.querySelector('.main-header').offsetHeight : 0;
                const topPos = mainPlayer.getBoundingClientRect().top + window.scrollY - headerOffset - 8;
                window.scrollTo({ top: topPos, behavior: 'smooth' });
            }, 40);
        });
        sidebar.appendChild(item);
    });

    // Add close button to main player for this section-scoped theater
    const existingClose = mainPlayer.querySelector('.theater-close-btn');
    if (existingClose) existingClose.remove();
    const closeBtn = createCloseButton('Close');
    closeBtn.addEventListener('click', () => {
        // remove wrapper
        wrapper.remove();
        // restore original content container
        contentContainer.style.display = '';
        // restore video grid
        const videoGrid = sectionEl.querySelector('.home-video-grid');
        if (videoGrid) videoGrid.style.display = '';
        // scroll to the section top
        setTimeout(() => {
            const headerOffset = document.querySelector('.main-header') ? document.querySelector('.main-header').offsetHeight : 0;
            const topPos = sectionEl.getBoundingClientRect().top + window.scrollY - headerOffset - 8;
            window.scrollTo({ top: topPos, behavior: 'smooth' });
        }, 40);
    });
    mainPlayer.appendChild(closeBtn);

    // initial highlight for selected (if present in sidebar not possible since excluded) - add selected to top of sidebar optionally
}

// ============================================
// THE JOKER - SETTINGS PANEL (Phase 2)
// ============================================

// Settings state management
const settingsState = {
    currentAction: 'profile',
    customization: {
        // Accent Colors
        primaryColor: '#3498db',
        secondaryColor: '#2c3e50',
        accentColor: '#f39c12',
        successColor: '#27ae60',
        errorColor: '#e74c3c',
        
        // Background Colors
        mainBg: '#f0f2f5',
        queenBg: '#ffffff',
        sidebarBg: '#2c3e50',
        cardBg: '#ffffff',
        playerBg: '#000000',
        
        // Text Colors
        textColor: '#333333',
        sidebarText: '#ffffff',
        textSecondary: '#666666',
        
        // Border & UI Colors
        borderColor: '#dddddd',
        inputBg: '#f8f9fa',
        searchBg: '#000000',
        
        // Display Options
        darkMode: false,
        animations: true,
        compactMode: false,
        
        // Layout Size
        sidebarWidth: 280,
        
        // Typography
        fontFamily: "'Inter', sans-serif",
        fontSize: 16
    },
    
    // Profile data
    profile: {
        name: '',
        email: '',
        ministry: '',
        bio: '',
        avatar: '',
        socialLinks: {
            website: '',
            youtube: '',
            instagram: '',
            twitter: '',
            facebook: ''
        }
    }
};

const LEGACY_PROFILE_STORAGE_KEY = 'ruiruProfile';
const GUEST_PROFILE_STORAGE_KEY = 'ruiruProfileGuest';
let currentProfileUid = null;
let latestProfileLoadRequestId = 0;

function getEmptyProfileState() {
    return {
        name: '',
        email: '',
        ministry: '',
        bio: '',
        avatar: '',
        socialLinks: {
            website: '',
            youtube: '',
            instagram: '',
            twitter: '',
            facebook: ''
        }
    };
}

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('ruiruMediaHouseSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            settingsState.customization = { ...settingsState.customization, ...parsed };
            applyCustomization();
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    }
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('ruiruMediaHouseSettings', JSON.stringify(settingsState.customization));
    showSavedIndicator();
}

// Show saved indicator
function showSavedIndicator() {
    let indicator = document.querySelector('.saved-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'saved-indicator';
        indicator.innerHTML = '<i class="fas fa-check-circle"></i> Settings saved!';
        document.body.appendChild(indicator);
    }
    indicator.classList.add('show');
    setTimeout(() => {
        indicator.classList.remove('show');
    }, 2500);
}

// Apply customization to the live mirror
function applyCustomization() {
    const mirror = document.querySelector('.customization-mirror');
    const root = document.documentElement;
    const custom = settingsState.customization;
    
    // Apply all colors to CSS variables
    root.style.setProperty('--primary-color', custom.primaryColor);
    root.style.setProperty('--secondary-color', custom.secondaryColor);
    root.style.setProperty('--accent-color', custom.accentColor);
    root.style.setProperty('--success-color', custom.successColor);
    root.style.setProperty('--error-color', custom.errorColor);
    
    root.style.setProperty('--background-color', custom.mainBg);
    root.style.setProperty('--card-background', custom.cardBg);
    root.style.setProperty('--text-color', custom.textColor);
    root.style.setProperty('--text-secondary', custom.textSecondary);
    root.style.setProperty('--border-color', custom.borderColor);
    root.style.setProperty('--input-background', custom.inputBg);
    
    // Update mirror preview
    if (mirror) {
        mirror.style.setProperty('--queen-bg', custom.queenBg);
        mirror.style.setProperty('--sidebar-bg', custom.sidebarBg);
        mirror.style.setProperty('--sidebar-text', custom.sidebarText);
        mirror.style.setProperty('--player-bg', custom.playerBg);
        mirror.style.setProperty('--card-bg', custom.cardBg);
        mirror.style.setProperty('--text-color', custom.textColor);
    }
    
    // Apply to main page elements
    const mainHeader = document.querySelector('.main-header');
    const sidebarWrapper = document.querySelector('.sidebar-wrapper');
    const mainContentWrapper = document.querySelector('.main-content-wrapper');
    const heroPlayer = document.querySelector('.hero-player-content');
    const searchBar = document.querySelector('.search-bar');
    const contentSections = document.querySelectorAll('.content-section');
    
    if (mainHeader) mainHeader.style.background = custom.queenBg;
    if (sidebarWrapper) sidebarWrapper.style.background = custom.sidebarBg;
    if (mainContentWrapper) mainContentWrapper.style.background = custom.mainBg;
    if (heroPlayer) heroPlayer.style.background = custom.playerBg;
    if (searchBar) searchBar.style.background = custom.searchBg;
    
    contentSections.forEach(section => {
        if (section) section.style.background = custom.cardBg;
    });
    
    // Apply font settings
    if (custom.fontFamily) {
        document.body.style.fontFamily = custom.fontFamily;
    }
    if (custom.fontSize) {
        document.body.style.fontSize = custom.fontSize + 'px';
    }
    
    // Dark mode
    if (custom.darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    // Save settings
    saveSettings();
}

// Update Joker menu active state
function updateJokerMenu(activeBtn) {
    // Desktop buttons
    document.querySelectorAll('.joker-cmd').forEach(btn => btn.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
    
    // Mobile icons - sync with desktop
    const action = activeBtn ? activeBtn.dataset.action : null;
    if (action) {
        document.querySelectorAll('.joker-mobile-icon-container').forEach(icon => {
            icon.classList.remove('active');
            if (icon.dataset.action === action) {
                icon.classList.add('active');
            }
        });
    }
}

// Render Profile Section
function renderProfileSection() {
    const container = document.createElement('div');
    container.className = 'joker-action profile-section';
    container.innerHTML = `
        <h2><i class="fas fa-user"></i> Profile Settings</h2>
        
        <!-- Avatar Section -->
        <div class="avatar-upload">
            <div class="avatar-preview" id="avatarPreview">JD</div>
            <div>
                <input type="file" id="avatarInput" accept="image/*" style="display:none;">
                <button class="avatar-btn" id="avatarUploadBtn">Upload Photo</button>
                <p style="font-size:0.85em;color:#888;margin-top:8px;">JPG, PNG or GIF. Maximum allowed file size is 3MB.</p>
            </div>
        </div>
        
        <!-- Basic Info -->
        <div class="field">
            <label>Display Name</label>
            <input type="text" id="profileName" placeholder="Your display name">
        </div>
        <div class="field">
            <label>Email</label>
            <input type="email" id="profileEmail" placeholder="your@email.com">
        </div>
        <div class="field">
            <label>Ministry / Church Affiliation</label>
            <input type="text" id="profileMinistry" placeholder="Your church or ministry name">
        </div>
        <div class="field">
            <label>Bio</label>
            <textarea id="profileBio" rows="4" placeholder="Tell us about yourself..."></textarea>
        </div>
        
        <!-- Social Media Links -->
        <h3 style="margin-top:24px;margin-bottom:16px;font-size:1.1em;"><i class="fas fa-share-alt"></i> Social Media</h3>
        <div class="social-links">
            <div class="field social-field">
                <label><i class="fas fa-globe"></i> Website</label>
                <input type="url" id="socialWebsite" placeholder="https://yourwebsite.com">
            </div>
            <div class="field social-field">
                <label><i class="fab fa-youtube"></i> YouTube</label>
                <input type="url" id="socialYoutube" placeholder="https://youtube.com/@yourchannel">
            </div>
            <div class="field social-field">
                <label><i class="fab fa-instagram"></i> Instagram</label>
                <input type="url" id="socialInstagram" placeholder="https://instagram.com/yourusername">
            </div>
            <div class="field social-field">
                <label><i class="fab fa-twitter"></i> Twitter / X</label>
                <input type="url" id="socialTwitter" placeholder="https://twitter.com/yourusername">
            </div>
            <div class="field social-field">
                <label><i class="fab fa-facebook"></i> Facebook</label>
                <input type="url" id="socialFacebook" placeholder="https://facebook.com/yourpage">
            </div>
        </div>
        
        <button class="joker-submit" onclick="saveProfile()">Save Profile</button>
    `;
    
    // Add event listeners after DOM is ready
    setTimeout(() => {
        // Load saved profile data
        loadProfile();
        
        // Avatar upload button
        const avatarInput = document.getElementById('avatarInput');
        const avatarUploadBtn = document.getElementById('avatarUploadBtn');
        
        if (avatarUploadBtn && avatarInput) {
            avatarUploadBtn.addEventListener('click', () => {
                avatarInput.click();
            });
            
            avatarInput.addEventListener('change', (e) => {
                handleAvatarUpload(e.target);
            });
        }
        
        // Update avatar preview when name changes (if no avatar)
        const nameInput = document.getElementById('profileName');
        const avatarPreview = document.getElementById('avatarPreview');
        
        if (nameInput && avatarPreview && !settingsState.profile.avatar) {
            nameInput.addEventListener('input', (e) => {
                if (e.target.value && !settingsState.profile.avatar) {
                    avatarPreview.textContent = e.target.value.charAt(0).toUpperCase();
                }
            });
        }
    }, 0);
    
    return container;
}

// Render Customization Studio (Phase 3)
function renderCustomizationSection() {
    const container = document.createElement('div');
    container.className = 'joker-action';
    container.innerHTML = `
        <h2><i class="fas fa-palette"></i> Customization Studio</h2>
        <div class="customization-studio">
            <div class="customization-controls">
                <h3><i class="fas fa-sliders-h"></i> Theme Colors</h3>
                
                <!-- Background Colors -->
                <div class="control-group">
                    <h4><i class="fas fa-square-full"></i> Background Colors</h4>
                    <div class="color-picker-wrapper">
                        <label>Main Background</label>
                        <input type="color" id="colorMainBg" value="${settingsState.customization.mainBg || '#f0f2f5'}">
                        <span class="color-value">${settingsState.customization.mainBg || '#f0f2f5'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Header Background</label>
                        <input type="color" id="colorQueenBg" value="${settingsState.customization.queenBg}">
                        <span class="color-value">${settingsState.customization.queenBg}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Sidebar Background</label>
                        <input type="color" id="colorSidebarBg" value="${settingsState.customization.sidebarBg}">
                        <span class="color-value">${settingsState.customization.sidebarBg}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Card Background</label>
                        <input type="color" id="colorCardBg" value="${settingsState.customization.cardBg || '#ffffff'}">
                        <span class="color-value">${settingsState.customization.cardBg || '#ffffff'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Player Background</label>
                        <input type="color" id="colorPlayerBg" value="${settingsState.customization.playerBg}">
                        <span class="color-value">${settingsState.customization.playerBg}</span>
                    </div>
                </div>
                
                <!-- Text Colors -->
                <div class="control-group">
                    <h4><i class="fas fa-font"></i> Text Colors</h4>
                    <div class="color-picker-wrapper">
                        <label>Main Text</label>
                        <input type="color" id="colorText" value="${settingsState.customization.textColor || '#333333'}">
                        <span class="color-value">${settingsState.customization.textColor || '#333333'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Sidebar Text</label>
                        <input type="color" id="colorSidebarText" value="${settingsState.customization.sidebarText || '#ffffff'}">
                        <span class="color-value">${settingsState.customization.sidebarText || '#ffffff'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Secondary Text</label>
                        <input type="color" id="colorTextSecondary" value="${settingsState.customization.textSecondary || '#666666'}">
                        <span class="color-value">${settingsState.customization.textSecondary || '#666666'}</span>
                    </div>
                </div>
                
                <!-- Accent Colors -->
                <div class="control-group">
                    <h4><i class="fas fa-star"></i> Accent Colors</h4>
                    <div class="color-picker-wrapper">
                        <label>Primary Color</label>
                        <input type="color" id="colorPrimary" value="${settingsState.customization.primaryColor}">
                        <span class="color-value">${settingsState.customization.primaryColor}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Secondary Color</label>
                        <input type="color" id="colorSecondary" value="${settingsState.customization.secondaryColor}">
                        <span class="color-value">${settingsState.customization.secondaryColor}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Accent/Highlight</label>
                        <input type="color" id="colorAccent" value="${settingsState.customization.accentColor || '#f39c12'}">
                        <span class="color-value">${settingsState.customization.accentColor || '#f39c12'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Success Color</label>
                        <input type="color" id="colorSuccess" value="${settingsState.customization.successColor || '#27ae60'}">
                        <span class="color-value">${settingsState.customization.successColor || '#27ae60'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Error Color</label>
                        <input type="color" id="colorError" value="${settingsState.customization.errorColor || '#e74c3c'}">
                        <span class="color-value">${settingsState.customization.errorColor || '#e74c3c'}</span>
                    </div>
                </div>
                
                <!-- Border & UI Colors -->
                <div class="control-group">
                    <h4><i class="fas fa-border-all"></i> Border & UI Colors</h4>
                    <div class="color-picker-wrapper">
                        <label>Border Color</label>
                        <input type="color" id="colorBorder" value="${settingsState.customization.borderColor || '#dddddd'}">
                        <span class="color-value">${settingsState.customization.borderColor || '#dddddd'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Input Background</label>
                        <input type="color" id="colorInputBg" value="${settingsState.customization.inputBg || '#f8f9fa'}">
                        <span class="color-value">${settingsState.customization.inputBg || '#f8f9fa'}</span>
                    </div>
                    <div class="color-picker-wrapper">
                        <label>Search Bar</label>
                        <input type="color" id="colorSearchBg" value="${settingsState.customization.searchBg || '#000000'}">
                        <span class="color-value">${settingsState.customization.searchBg}</span>
                    </div>
                </div>
                
                <!-- Display Options -->
                <div class="control-group">
                    <h4><i class="fas fa-display"></i> Display Options</h4>
                    <div class="toggle-wrapper">
                        <label>Dark Mode</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggleDarkMode" ${settingsState.customization.darkMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="toggle-wrapper">
                        <label>Animations</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggleAnimations" ${settingsState.customization.animations !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="toggle-wrapper">
                        <label>Compact Mode</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggleCompact" ${settingsState.customization.compactMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <!-- Layout Size -->
                <div class="control-group">
                    <h4><i class="fas fa-expand"></i> Layout Size</h4>
                    <div class="range-wrapper">
                        <label>Sidebar Width: <span class="range-value" id="sidebarWidthValue">${settingsState.customization.sidebarWidth || 280}px</span></label>
                        <input type="range" id="rangeSidebarWidth" min="200" max="400" value="${settingsState.customization.sidebarWidth || 280}">
                    </div>
                </div>
                
                <!-- Font Settings -->
                <div class="control-group">
                    <h4><i class="fas fa-font"></i> Typography</h4>
                    <div class="field">
                        <label>Font Family</label>
                        <select id="fontFamily">
                            <option value="'Inter', sans-serif" ${settingsState.customization.fontFamily === "'Inter', sans-serif" ? 'selected' : ''}>Inter (Default)</option>
                            <option value="'Arial', sans-serif" ${settingsState.customization.fontFamily === "'Arial', sans-serif" ? 'selected' : ''}>Arial</option>
                            <option value="'Helvetica', sans-serif" ${settingsState.customization.fontFamily === "'Helvetica', sans-serif" ? 'selected' : ''}>Helvetica</option>
                            <option value="'Georgia', serif" ${settingsState.customization.fontFamily === "'Georgia', serif" ? 'selected' : ''}>Georgia</option>
                            <option value="'Times New Roman', serif" ${settingsState.customization.fontFamily === "'Times New Roman', serif" ? 'selected' : ''}>Times New Roman</option>
                            <option value="'Courier New', monospace" ${settingsState.customization.fontFamily === "'Courier New', monospace" ? 'selected' : ''}>Courier New</option>
                        </select>
                    </div>
                    <div class="range-wrapper">
                        <label>Font Size: <span class="range-value" id="fontSizeValue">${settingsState.customization.fontSize || 16}px</span></label>
                        <input type="range" id="rangeFontSize" min="12" max="24" value="${settingsState.customization.fontSize || 16}">
                    </div>
                </div>
                
                <button class="joker-submit" onclick="saveCustomization()">Apply & Save</button>
                <button class="joker-submit" style="background:#95a5a6;margin-left:8px;" onclick="resetCustomization()">Reset to Default</button>
            </div>
            
            <div class="customization-mirror">
                <div class="mirror-header">
                    <span style="font-weight:bold;color:#333;">Ruiru Media House</span>
                    <div style="display:flex;gap:8px;">
                        <span style="width:32px;height:32px;background:#ddd;border-radius:50%;"></span>
                    </div>
                </div>
                <div class="mirror-sidebar"></div>
                <div class="mirror-content">
                    <div class="mirror-hero">
                        <i class="fas fa-play-circle" style="font-size:3em;opacity:0.7;"></i>
                    </div>
                    <div style="background:#fff;padding:16px;border-radius:8px;margin-bottom:12px;">
                        <h4 style="margin:0 0 8px 0;">Welcome Title</h4>
                        <p style="margin:0;color:#666;font-size:0.9em;">This is a preview of your content area...</p>
                    </div>
                </div>
                <div class="mirror-label">Live Preview</div>
            </div>
        </div>
    `;
    
    // Add color picker listeners
    setTimeout(() => {
        document.querySelectorAll('.color-picker-wrapper input[type="color"]').forEach(picker => {
            picker.addEventListener('input', (e) => {
                e.target.nextElementSibling.textContent = e.target.value;
                updateLivePreview();
            });
        });
        
        document.querySelectorAll('.toggle-wrapper input[type="checkbox"]').forEach(toggle => {
            toggle.addEventListener('change', updateLivePreview);
        });
        
        document.getElementById('rangeSidebarWidth')?.addEventListener('input', (e) => {
            document.getElementById('sidebarWidthValue').textContent = e.target.value + 'px';
            updateLivePreview();
        });
        
        document.getElementById('rangeFontSize')?.addEventListener('input', (e) => {
            document.getElementById('fontSizeValue').textContent = e.target.value + 'px';
            updateLivePreview();
        });
        
        document.getElementById('fontFamily')?.addEventListener('change', updateLivePreview);
    }, 0);
    
    return container;
}

// Update live preview based on controls
function updateLivePreview() {
    const custom = settingsState.customization;
    
    // Background Colors
    custom.mainBg = document.getElementById('colorMainBg')?.value || custom.mainBg;
    custom.queenBg = document.getElementById('colorQueenBg')?.value || custom.queenBg;
    custom.sidebarBg = document.getElementById('colorSidebarBg')?.value || custom.sidebarBg;
    custom.cardBg = document.getElementById('colorCardBg')?.value || custom.cardBg;
    custom.playerBg = document.getElementById('colorPlayerBg')?.value || custom.playerBg;
    
    // Text Colors
    custom.textColor = document.getElementById('colorText')?.value || custom.textColor;
    custom.sidebarText = document.getElementById('colorSidebarText')?.value || custom.sidebarText;
    custom.textSecondary = document.getElementById('colorTextSecondary')?.value || custom.textSecondary;
    
    // Accent Colors
    custom.primaryColor = document.getElementById('colorPrimary')?.value || custom.primaryColor;
    custom.secondaryColor = document.getElementById('colorSecondary')?.value || custom.secondaryColor;
    custom.accentColor = document.getElementById('colorAccent')?.value || custom.accentColor;
    custom.successColor = document.getElementById('colorSuccess')?.value || custom.successColor;
    custom.errorColor = document.getElementById('colorError')?.value || custom.errorColor;
    
    // Border & UI Colors
    custom.borderColor = document.getElementById('colorBorder')?.value || custom.borderColor;
    custom.inputBg = document.getElementById('colorInputBg')?.value || custom.inputBg;
    custom.searchBg = document.getElementById('colorSearchBg')?.value || custom.searchBg;
    
    // Display Options
    custom.darkMode = document.getElementById('toggleDarkMode')?.checked || false;
    custom.animations = document.getElementById('toggleAnimations')?.checked || true;
    custom.compactMode = document.getElementById('toggleCompact')?.checked || false;
    
    // Layout Size
    custom.sidebarWidth = document.getElementById('rangeSidebarWidth')?.value || 280;
    
    // Typography
    custom.fontFamily = document.getElementById('fontFamily')?.value || custom.fontFamily;
    custom.fontSize = document.getElementById('rangeFontSize')?.value || 16;
    
    applyCustomization();
}

// Render Security Section
function renderSecuritySection() {
    const container = document.createElement('div');
    container.className = 'joker-action security-section';
    container.innerHTML = `
        <h2><i class="fas fa-shield-alt"></i> Security Settings</h2>
        
        <div class="security-item">
            <div class="security-info">
                <h4>Two-Factor Authentication</h4>
                <p>Add an extra layer of security to your account</p>
            </div>
            <div class="security-status inactive">
                <i class="fas fa-times-circle"></i> Disabled
            </div>
        </div>
        
        <div class="security-item">
            <div class="security-info">
                <h4>Login Notifications</h4>
                <p>Get notified when someone logs into your account</p>
            </div>
            <div class="security-status active">
                <i class="fas fa-check-circle"></i> Active
            </div>
        </div>
        
        <div class="security-item">
            <div class="security-info">
                <h4>Session Management</h4>
                <p>View and manage your active sessions</p>
            </div>
            <button style="padding:8px 16px;background:#f0f0f0;border:1px solid #ddd;border-radius:6px;cursor:pointer;">Manage</button>
        </div>
        
        <div class="field" style="margin-top:24px;">
            <label>Current Password</label>
            <input type="password" id="securityCurrentPass" placeholder="Enter current password">
        </div>
        <div class="field">
            <label>New Password</label>
            <input type="password" id="securityNewPass" placeholder="Enter new password">
        </div>
        <div class="field">
            <label>Confirm Password</label>
            <input type="password" id="securityConfirmPass" placeholder="Confirm new password">
        </div>
        
        <button class="joker-submit" onclick="updateSecurity()">Update Password</button>
    `;
    return container;
}

// Save Profile
function saveProfile() {
    const authenticatedEmail = auth.currentUser?.email || '';
    const profile = {
        name: document.getElementById('profileName')?.value || '',
        email: authenticatedEmail || document.getElementById('profileEmail')?.value || '',
        ministry: document.getElementById('profileMinistry')?.value || '',
        bio: document.getElementById('profileBio')?.value || '',
        avatar: settingsState.profile.avatar || '',
        socialLinks: {
            website: document.getElementById('socialWebsite')?.value || '',
            youtube: document.getElementById('socialYoutube')?.value || '',
            instagram: document.getElementById('socialInstagram')?.value || '',
            twitter: document.getElementById('socialTwitter')?.value || '',
            facebook: document.getElementById('socialFacebook')?.value || ''
        }
    };
    
    settingsState.profile = profile;
    persistProfileToLocalStorage();
    updateProfileAvatarUI(profile.avatar || '');
    persistProfileToBackend(profile.avatar || '');
    
    showSavedIndicator();
}

// Reset Customization to Defaults
function resetCustomization() {
    settingsState.customization = {
        primaryColor: '#3498db',
        secondaryColor: '#2c3e50',
        accentColor: '#f39c12',
        successColor: '#27ae60',
        errorColor: '#e74c3c',
        mainBg: '#f0f2f5',
        queenBg: '#ffffff',
        sidebarBg: '#2c3e50',
        cardBg: '#ffffff',
        playerBg: '#000000',
        textColor: '#333333',
        sidebarText: '#ffffff',
        textSecondary: '#666666',
        borderColor: '#dddddd',
        inputBg: '#f8f9fa',
        searchBg: '#000000',
        darkMode: false,
        animations: true,
        compactMode: false,
        sidebarWidth: 280,
        fontFamily: "'Inter', sans-serif",
        fontSize: 16
    };
    
    // Re-render customization section
    renderJokerDetails('customization');
    applyCustomization();
    showSavedIndicator();
}

// Load Profile from localStorage
function loadProfile() {
    if (auth.currentUser) {
        applyProfileStateToForm();
        return;
    }

    let parsed = null;
    const savedGuest = localStorage.getItem(GUEST_PROFILE_STORAGE_KEY);
    if (savedGuest) {
        try {
            parsed = JSON.parse(savedGuest);
        } catch (e) {
            console.warn('Failed to parse guest profile cache:', e);
        }
    } else {
        // One-time migration path for older guests (email intentionally excluded).
        const legacy = localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY);
        if (legacy) {
            try {
                parsed = JSON.parse(legacy);
            } catch (e) {
                console.warn('Failed to parse legacy profile cache:', e);
            }
            localStorage.removeItem(LEGACY_PROFILE_STORAGE_KEY);
        }
    }

    if (parsed) {
        settingsState.profile = {
            ...getEmptyProfileState(),
            ...settingsState.profile,
            ...parsed,
            email: '',
            socialLinks: {
                ...getEmptyProfileState().socialLinks,
                ...settingsState.profile.socialLinks,
                ...(parsed.socialLinks || {})
            }
        };
    }

    applyProfileStateToForm();
}

// Apply avatar to visible profile UI surfaces
function updateProfileAvatarUI(avatarRef) {
    document.querySelectorAll('#avatarPreview, .avatar-preview').forEach((avatarPreview) => {
        if (avatarRef) {
            avatarPreview.style.backgroundImage = `url(${avatarRef})`;
            avatarPreview.style.backgroundSize = 'cover';
            avatarPreview.style.backgroundPosition = 'center';
            avatarPreview.style.backgroundRepeat = 'no-repeat';
            avatarPreview.textContent = '';
        } else {
            avatarPreview.style.backgroundImage = '';
            avatarPreview.style.backgroundSize = '';
            avatarPreview.style.backgroundPosition = '';
            avatarPreview.style.backgroundRepeat = '';
            if (settingsState.profile.name) {
                avatarPreview.textContent = settingsState.profile.name.charAt(0).toUpperCase();
            }
        }
    });

    // Mirror avatar in header/profile chips if present.
    document.querySelectorAll('.profile-circle').forEach((el) => {
        if (avatarRef) {
            el.style.backgroundImage = `url(${avatarRef})`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
            el.style.backgroundRepeat = 'no-repeat';
            el.textContent = '';
        } else {
            el.style.backgroundImage = '';
            el.style.backgroundSize = '';
            el.style.backgroundPosition = '';
            el.style.backgroundRepeat = '';
        }
    });
}

function applyProfileStateToForm() {
    const nameField = document.getElementById('profileName');
    const emailField = document.getElementById('profileEmail');
    const ministryField = document.getElementById('profileMinistry');
    const bioField = document.getElementById('profileBio');

    if (nameField) nameField.value = settingsState.profile.name || '';
    if (emailField) {
        emailField.value = auth.currentUser?.email || settingsState.profile.email || '';
        const isAuthenticated = Boolean(auth.currentUser);
        emailField.readOnly = isAuthenticated;
        if (isAuthenticated) {
            emailField.setAttribute('title', 'Email is managed by Firebase Authentication.');
        } else {
            emailField.removeAttribute('title');
        }
    }
    if (ministryField) ministryField.value = settingsState.profile.ministry || '';
    if (bioField) bioField.value = settingsState.profile.bio || '';

    updateProfileAvatarUI(settingsState.profile.avatar || '');

    const socialFields = ['website', 'youtube', 'instagram', 'twitter', 'facebook'];
    socialFields.forEach(field => {
        const input = document.getElementById(`social${field.charAt(0).toUpperCase() + field.slice(1)}`);
        if (input && settingsState.profile.socialLinks) {
            input.value = settingsState.profile.socialLinks[field] || '';
        }
    });
}

function resetProfileState() {
    settingsState.profile = getEmptyProfileState();
    currentProfileUid = null;
    applyProfileStateToForm();
}

function persistProfileToLocalStorage() {
    if (auth.currentUser) {
        localStorage.removeItem(GUEST_PROFILE_STORAGE_KEY);
        localStorage.removeItem(LEGACY_PROFILE_STORAGE_KEY);
        return;
    }

    const guestProfile = {
        name: settingsState.profile.name || '',
        ministry: settingsState.profile.ministry || '',
        bio: settingsState.profile.bio || '',
        avatar: settingsState.profile.avatar || '',
        socialLinks: {
            ...getEmptyProfileState().socialLinks,
            ...(settingsState.profile.socialLinks || {})
        }
    };

    localStorage.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(guestProfile));
}

async function persistProfileToBackend(avatarRef, expectedUid = auth?.currentUser?.uid) {
    const currentUser = auth?.currentUser;
    if (!currentUser) return avatarRef;
    if (expectedUid && currentUser.uid !== expectedUid) return avatarRef;

    const resolvedAvatar = avatarRef || settingsState.profile.avatar || '';
    const resolvedEmail = currentUser.email || settingsState.profile.email || '';
    const resolvedName = settingsState.profile.name || currentUser.displayName || '';
    const safeSocial = {
        ...getEmptyProfileState().socialLinks,
        ...(settingsState.profile.socialLinks || {})
    };

    settingsState.profile = {
        ...getEmptyProfileState(),
        ...settingsState.profile,
        name: resolvedName,
        email: resolvedEmail,
        avatar: resolvedAvatar,
        socialLinks: safeSocial
    };

    try {
        const userRef = doc(db, "users", currentUser.uid);
        const payload = {
            uid: currentUser.uid,
            email: resolvedEmail,
            username: resolvedName,
            avatar: resolvedAvatar,
            profile: {
                ...settingsState.profile,
                avatar: resolvedAvatar,
                email: resolvedEmail,
                name: resolvedName,
                socialLinks: safeSocial
            },
            profileUpdatedAt: new Date().toISOString()
        };
        await setDoc(userRef, payload, { merge: true });
        currentProfileUid = currentUser.uid;
    } catch (e) {
        console.warn('Failed to sync profile to backend:', e);
    }
    return resolvedAvatar;
}

async function loadProfileFromBackend(user) {
    if (!user?.uid) return;
    const requestedUid = user.uid;
    const requestId = ++latestProfileLoadRequestId;
    const baseProfile = getEmptyProfileState();

    try {
        const snap = await getDoc(doc(db, "users", requestedUid));
        if (requestId !== latestProfileLoadRequestId || auth.currentUser?.uid !== requestedUid) {
            return;
        }

        const data = snap.exists() ? (snap.data() || {}) : {};
        const backendProfile = (data.profile && typeof data.profile === 'object') ? data.profile : {};
        const resolvedSocialLinks = {
            ...baseProfile.socialLinks,
            ...(backendProfile.socialLinks || {})
        };

        const resolvedProfile = {
            ...baseProfile,
            ...backendProfile,
            name: backendProfile.name || data.username || user.displayName || '',
            email: user.email || backendProfile.email || data.email || '',
            avatar: backendProfile.avatar || data.avatar || user.photoURL || '',
            socialLinks: resolvedSocialLinks
        };

        settingsState.profile = resolvedProfile;
        currentProfileUid = requestedUid;
        localStorage.removeItem(GUEST_PROFILE_STORAGE_KEY);
        localStorage.removeItem(LEGACY_PROFILE_STORAGE_KEY);
        applyProfileStateToForm();
        await persistProfileToBackend(resolvedProfile.avatar, requestedUid);
    } catch (e) {
        console.warn('Failed to load profile from backend:', e);
        if (requestId !== latestProfileLoadRequestId || auth.currentUser?.uid !== requestedUid) {
            return;
        }

        settingsState.profile = {
            ...baseProfile,
            name: user.displayName || '',
            email: user.email || '',
            avatar: user.photoURL || '',
            socialLinks: { ...baseProfile.socialLinks }
        };
        currentProfileUid = requestedUid;
        applyProfileStateToForm();
    }
}

async function dataUrlToAvatarFile(dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const ext = (blob.type && blob.type.includes('png')) ? 'png' : 'jpg';
    const mime = blob.type || 'image/jpeg';
    return new File([blob], `profile-cropped-${Date.now()}.${ext}`, { type: mime });
}

function replaceAvatarInputFile(file) {
    const avatarInput = document.getElementById('avatarInput');
    if (!avatarInput || !file || typeof DataTransfer === 'undefined') return;
    try {
        const dt = new DataTransfer();
        dt.items.add(file);
        avatarInput.files = dt.files;
    } catch (e) {
        console.warn('Failed to replace avatar input file:', e);
    }
}

function resolveAvatarUploadRef(uploadResult, fallbackRef) {
    if (!uploadResult) return fallbackRef;
    if (typeof uploadResult === 'string') return uploadResult;
    if (typeof uploadResult === 'object') {
        return uploadResult.url || uploadResult.avatarUrl || uploadResult.imageUrl || uploadResult.path || fallbackRef;
    }
    return fallbackRef;
}

async function uploadAvatarViaExistingPipeline(croppedFile, fallbackRef) {
    const existingUpload =
        window.uploadProfileAvatar ||
        window.uploadAvatar ||
        window.uploadProfileImage ||
        window.handleProfileImageUpload;

    if (typeof existingUpload !== 'function') {
        return fallbackRef;
    }

    try {
        const uploadResult = await existingUpload(croppedFile);
        return resolveAvatarUploadRef(uploadResult, fallbackRef);
    } catch (e) {
        console.warn('Existing avatar upload handler failed; falling back to local image ref:', e);
        return fallbackRef;
    }
}

// Handle avatar upload - Opens crop modal instead of direct upload
function handleAvatarUpload(input) {
    const file = input.files[0];
    if (file) {
        if (file.size > 3 * 1024 * 1024) {
            alert('Maximum allowed file size is 3MB.');
            return;
        }
        
        // Store the file for later use after crop
        window.pendingAvatarFile = file;
        
        // Read the file and open the crop modal
        const reader = new FileReader();
        reader.onload = function(e) {
            window.pendingAvatarDataUrl = e.target.result;
            openImageCropModal(e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

// Image Crop Modal State
const cropState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    dragPointerId: null,
    startX: 0,
    startY: 0,
    imageWidth: 0,
    imageHeight: 0,
    renderWidth: 0,
    renderHeight: 0,
    containerWidth: 0,
    containerHeight: 0,
    teardown: null
};

// Open the image crop modal
function openImageCropModal(imageSrc) {
    // Remove existing modal if any
    const existingModal = document.getElementById('imageCropModalOverlay');
    if (existingModal) {
        if (typeof cropState.teardown === 'function') {
            cropState.teardown();
            cropState.teardown = null;
        }
        existingModal.remove();
    }
    
    // Reset crop state
    cropState.scale = 1;
    cropState.translateX = 0;
    cropState.translateY = 0;
    cropState.isDragging = false;
    cropState.dragPointerId = null;
    cropState.renderWidth = 0;
    cropState.renderHeight = 0;
    
    // Create modal HTML - clear inside circle, blurry outside
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'imageCropModalOverlay';
    modalOverlay.className = 'image-crop-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="image-crop-modal">
            <h3>Adjust Your Photo</h3>
            <div class="crop-main-container" id="cropMainContainer">
                <!-- Blur layer behind - shows blurry version outside circle -->
                <div class="crop-blur-effect" id="cropBlurEffect">
                    <img src="${imageSrc}" id="cropBlurImage" alt="">
                </div>
                <!-- Main draggable image area -->
                <div class="crop-image-area" id="cropImageArea">
                    <img src="${imageSrc}" class="crop-main-image" id="cropMainImage" alt="Crop preview">
                </div>
                <!-- Radial gradient overlay to create blur effect outside circle -->
                <div class="crop-blur-overlay" id="cropBlurOverlay"></div>
                <!-- Circular frame border -->
                <div class="crop-circle-border" id="cropCircleBorder"></div>
            </div>
            <div class="zoom-control">
                <label>
                    Zoom
                    <span id="zoomValue">100%</span>
                </label>
                <input type="range" class="zoom-slider" id="zoomSlider" 
                    min="0" max="500" step="1" value="100">
            </div>
            <div class="crop-buttons">
                <button class="crop-btn cancel" id="cropCancelBtn">Cancel</button>
                <button class="crop-btn save" id="cropSaveBtn">Save Photo</button>
            </div>
            <p class="crop-hint"></p>
        </div>
    `;
    
    document.body.appendChild(modalOverlay);
    
    // Initialize the crop functionality
    initializeCropModal();
}

// Initialize crop modal interactions
function initializeCropModal() {
    const container = document.getElementById('cropImageArea');
    const image = document.getElementById('cropMainImage');
    const mainContainer = document.getElementById('cropMainContainer');
    const blurImage = document.getElementById('cropBlurImage');
    const circleBorder = document.getElementById('cropCircleBorder');
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomValue = document.getElementById('zoomValue');
    const cancelBtn = document.getElementById('cropCancelBtn');
    const saveBtn = document.getElementById('cropSaveBtn');
    const modalOverlay = document.getElementById('imageCropModalOverlay');
    
    if (!container || !image || !mainContainer || !zoomSlider || !zoomValue || !cancelBtn || !saveBtn || !modalOverlay) {
        return;
    }
    
    const syncContainerMetrics = function() {
        cropState.containerWidth = mainContainer.clientWidth || mainContainer.offsetWidth || 500;
        cropState.containerHeight = mainContainer.clientHeight || mainContainer.offsetHeight || 350;
    };
    syncContainerMetrics();
    
    // Initialize image position when it loads
    const initImage = function() {
        cropState.imageWidth = image.naturalWidth;
        cropState.imageHeight = image.naturalHeight;
        
        if (!cropState.imageWidth || !cropState.imageHeight) return;
        
        syncContainerMetrics();
        const circleDiameter = (circleBorder && circleBorder.offsetWidth) || 200;
        
        // Base fit: image always covers the crop circle at 100% zoom.
        const baseScale = Math.max(
            circleDiameter / cropState.imageWidth,
            circleDiameter / cropState.imageHeight
        );
        cropState.renderWidth = cropState.imageWidth * baseScale;
        cropState.renderHeight = cropState.imageHeight * baseScale;
        
        cropState.scale = 1;
        zoomSlider.value = 100;
        zoomValue.textContent = '100%';
        
        // Center the image
        cropState.translateX = (cropState.containerWidth - cropState.renderWidth) / 2;
        cropState.translateY = (cropState.containerHeight - cropState.renderHeight) / 2;
        
        image.style.width = `${cropState.renderWidth}px`;
        image.style.height = `${cropState.renderHeight}px`;
        if (blurImage) {
            blurImage.style.width = `${cropState.renderWidth}px`;
            blurImage.style.height = `${cropState.renderHeight}px`;
        }
        
        updateImageTransform();
    };
    
    if (image.complete) {
        initImage();
    } else {
        image.onload = initImage;
    }
    
    // Drag functionality (mouse + touch via pointer events)
    const startDrag = function(e) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        cropState.isDragging = true;
        cropState.dragPointerId = e.pointerId;
        
        const clientX = e.clientX;
        const clientY = e.clientY;
        
        cropState.startX = clientX - cropState.translateX;
        cropState.startY = clientY - cropState.translateY;
        
        mainContainer.style.cursor = 'grabbing';
        if (mainContainer.setPointerCapture) {
            mainContainer.setPointerCapture(e.pointerId);
        }
    };
    
    const doDrag = function(e) {
        if (!cropState.isDragging) return;
        if (cropState.dragPointerId !== null && e.pointerId !== cropState.dragPointerId) return;
        e.preventDefault();
        
        const clientX = e.clientX;
        const clientY = e.clientY;
        
        // Keep drag state independent from zoom state.
        cropState.translateX = clientX - cropState.startX;
        cropState.translateY = clientY - cropState.startY;
        
        updateImageTransform();
    };
    
    const endDrag = function(e) {
        if (cropState.dragPointerId !== null && e.pointerId !== cropState.dragPointerId) return;
        cropState.isDragging = false;
        cropState.dragPointerId = null;
        mainContainer.style.cursor = 'grab';
    };
    
    mainContainer.style.cursor = 'grab';
    container.addEventListener('pointerdown', startDrag);
    window.addEventListener('pointermove', doDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    
    // Zoom updates scale only, preserving translateX/translateY.
    const onZoomInput = function() {
        const sliderValue = parseFloat(this.value);
        const newScale = Math.max(0.05, sliderValue / 100);
        const previousScale = cropState.scale || 1;
        if (!isFinite(newScale) || !isFinite(previousScale) || previousScale <= 0) return;
        
        const centerX = cropState.containerWidth / 2;
        const centerY = cropState.containerHeight / 2;
        
        const currentCenterX = cropState.translateX + (cropState.renderWidth * previousScale) / 2;
        const currentCenterY = cropState.translateY + (cropState.renderHeight * previousScale) / 2;
        
        const offsetX = currentCenterX - centerX;
        const offsetY = currentCenterY - centerY;
        
        const zoomRatio = newScale / previousScale;
        const newOffsetX = offsetX * zoomRatio;
        const newOffsetY = offsetY * zoomRatio;
        
        cropState.translateX = centerX - (cropState.renderWidth * newScale) / 2 + newOffsetX;
        cropState.translateY = centerY - (cropState.renderHeight * newScale) / 2 + newOffsetY;
        
        cropState.scale = newScale;
        zoomValue.textContent = `${Math.round(sliderValue)}%`;
        
        updateImageTransform();
    };
    zoomSlider.addEventListener('input', onZoomInput);
    
    // Cancel button
    const onCancel = function() {
        closeCropModal();
        const avatarInput = document.getElementById('avatarInput');
        if (avatarInput) {
            avatarInput.value = '';
        }
    };
    cancelBtn.addEventListener('click', onCancel);
    
    // Save button
    const onSave = async function() {
        const croppedDataUrl = cropImage();
        if (croppedDataUrl) {
            await applyCroppedAvatar(croppedDataUrl);
            closeCropModal();
        }
    };
    saveBtn.addEventListener('click', onSave);
    
    // Close on overlay click
    const onOverlayClick = function(e) {
        if (e.target === modalOverlay) {
            closeCropModal();
            const avatarInput = document.getElementById('avatarInput');
            if (avatarInput) {
                avatarInput.value = '';
            }
        }
    };
    modalOverlay.addEventListener('click', onOverlayClick);
    
    // ESC key to close
    const escHandler = function(e) {
        if (e.key === 'Escape') {
            closeCropModal();
            const avatarInput = document.getElementById('avatarInput');
            if (avatarInput) {
                avatarInput.value = '';
            }
        }
    };
    document.addEventListener('keydown', escHandler);
    
    const onWindowResize = function() {
        syncContainerMetrics();
    };
    window.addEventListener('resize', onWindowResize);
    
    cropState.teardown = function() {
        container.removeEventListener('pointerdown', startDrag);
        window.removeEventListener('pointermove', doDrag);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
        zoomSlider.removeEventListener('input', onZoomInput);
        cancelBtn.removeEventListener('click', onCancel);
        saveBtn.removeEventListener('click', onSave);
        modalOverlay.removeEventListener('click', onOverlayClick);
        document.removeEventListener('keydown', escHandler);
        window.removeEventListener('resize', onWindowResize);
    };
}

// Update image transform
function updateImageTransform() {
    const image = document.getElementById('cropMainImage');
    const blurImage = document.getElementById('cropBlurImage');
    
    if (image) {
        const transform = `translate(${cropState.translateX}px, ${cropState.translateY}px) scale(${cropState.scale})`;
        image.style.transform = transform;
        if (blurImage) {
            blurImage.style.transform = transform;
        }
    }
}

// Crop the image to a square (circular area)
function cropImage() {
    const image = document.getElementById('cropMainImage');
    const mainContainer = document.getElementById('cropMainContainer');
    const circleBorder = document.getElementById('cropCircleBorder');
    
    if (!image || !mainContainer) return null;
    
    const containerWidth = mainContainer.offsetWidth;
    const containerHeight = mainContainer.offsetHeight;
    const circleDiameter = (circleBorder && circleBorder.offsetWidth) || 200;
    const exportSize = 1024; // Preserve high detail in final avatar.
    
    // Create canvas for cropping
    const canvas = document.createElement('canvas');
    canvas.width = exportSize;
    canvas.height = exportSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    // Create circular clipping path
    ctx.beginPath();
    ctx.arc(exportSize / 2, exportSize / 2, exportSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // Map the visible crop circle to the export canvas.
    const circleLeft = (containerWidth - circleDiameter) / 2;
    const circleTop = (containerHeight - circleDiameter) / 2;
    const scaleRatio = exportSize / circleDiameter;
    
    const imageScaledWidth = (cropState.renderWidth || cropState.imageWidth) * cropState.scale;
    const imageScaledHeight = (cropState.renderHeight || cropState.imageHeight) * cropState.scale;
    
    const imageX = (cropState.translateX - circleLeft) * scaleRatio;
    const imageY = (cropState.translateY - circleTop) * scaleRatio;
    const imageDisplayWidth = imageScaledWidth * scaleRatio;
    const imageDisplayHeight = imageScaledHeight * scaleRatio;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw the image
    ctx.drawImage(
        image,
        imageX,
        imageY,
        imageDisplayWidth,
        imageDisplayHeight
    );
    
    // Return as data URL
    return canvas.toDataURL('image/jpeg', 0.92);
}

// Apply the cropped avatar
async function applyCroppedAvatar(croppedDataUrl) {
    if (!croppedDataUrl) return;

    let croppedFile = null;
    try {
        croppedFile = await dataUrlToAvatarFile(croppedDataUrl);
    } catch (e) {
        console.warn('Failed to convert cropped avatar to file:', e);
    }

    if (croppedFile) {
        replaceAvatarInputFile(croppedFile);
        window.pendingAvatarFile = croppedFile;
    }

    // Use existing upload flow if one exists; fallback to cropped data URL.
    const finalAvatarRef = croppedFile
        ? await uploadAvatarViaExistingPipeline(croppedFile, croppedDataUrl)
        : croppedDataUrl;

    settingsState.profile.avatar = finalAvatarRef;
    updateProfileAvatarUI(finalAvatarRef);
    persistProfileToLocalStorage();
    await persistProfileToBackend(finalAvatarRef);

    window.pendingAvatarDataUrl = finalAvatarRef;
}

// Close the crop modal
function closeCropModal() {
    if (typeof cropState.teardown === 'function') {
        cropState.teardown();
        cropState.teardown = null;
    }
    cropState.isDragging = false;
    cropState.dragPointerId = null;
    
    const modal = document.getElementById('imageCropModalOverlay');
    if (modal) {
        modal.remove();
    }
    
    // Clear pending data
    window.pendingAvatarFile = null;
    window.pendingAvatarDataUrl = null;
}

// Save Customization
function saveCustomization() {
    updateLivePreview();
    saveSettings();
}

// Update Security
function updateSecurity() {
    const currentPass = document.getElementById('securityCurrentPass')?.value;
    const newPass = document.getElementById('securityNewPass')?.value;
    const confirmPass = document.getElementById('securityConfirmPass')?.value;
    
    if (!currentPass || !newPass || !confirmPass) {
        alert('Please fill in all password fields');
        return;
    }
    
    if (newPass !== confirmPass) {
        alert('New passwords do not match');
        return;
    }
    
    alert('Password updated successfully! (Demo mode)');
    document.getElementById('securityCurrentPass').value = '';
    document.getElementById('securityNewPass').value = '';
    document.getElementById('securityConfirmPass').value = '';
}

// ============================================
// FIREBASE AUTHENTICATION
// ============================================

// Register user with Firebase
async function registerUser(email, username, password) {
    await authPersistenceReady;
    const normalizedEmail = (email || '').trim();
    const normalizedName = (username || '').trim();

    let user;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        user = userCredential.user;
    } catch (error) {
        const errorCode = error.code;
        const errorMessage = getAuthErrorMessage(errorCode, error.message);
        return { success: false, message: `${errorMessage}${errorCode ? ` (Code: ${errorCode})` : ''}` };
    }

    if (normalizedName) {
        try {
            await updateProfile(user, { displayName: normalizedName });
        } catch (e) {
            console.warn('Failed to set Firebase display name:', e);
        }
    }

    try {
        const userData = {
            uid: user.uid,
            email: user.email || normalizedEmail,
            username: normalizedName,
            avatar: user.photoURL || '',
            profile: {
                ...getEmptyProfileState(),
                name: normalizedName,
                email: user.email || normalizedEmail,
                avatar: user.photoURL || ''
            },
            createdAt: new Date().toISOString(),
            profileUpdatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, "users", user.uid), userData, { merge: true });
        await loadProfileFromBackend(user);
    } catch (error) {
        console.warn('Account created, but Firestore profile sync failed:', error);
        settingsState.profile = {
            ...getEmptyProfileState(),
            name: normalizedName || user.displayName || '',
            email: user.email || normalizedEmail,
            avatar: user.photoURL || '',
            socialLinks: { ...getEmptyProfileState().socialLinks }
        };
        applyProfileStateToForm();

        const syncCode = error?.code ? ` (Code: ${error.code})` : '';
        return {
            success: true,
            message: `Account created. Profile sync to Firestore failed${syncCode}, but you are logged in.`
        };
    }

    return { success: true, message: "Account created successfully! Welcome, " + (normalizedName || user.email) };
}

// Login user with Firebase
async function loginUser(email, password) {
    try {
        await authPersistenceReady;
        const normalizedEmail = (email || '').trim();
        const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        await loadProfileFromBackend(userCredential.user);
        return { success: true, message: "Login successful! Welcome back." };
    } catch (error) {
        const errorCode = error.code;
        const errorMessage = getAuthErrorMessage(errorCode, error.message);
        return { success: false, message: `${errorMessage}${errorCode ? ` (Code: ${errorCode})` : ''}` };
    }
}

// Logout user
async function logoutUser() {
    try {
        await signOut(auth);
        return { success: true, message: "Logged out successfully." };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

async function requestPasswordReset(email) {
    await authPersistenceReady;
    const normalizedEmail = (email || '').trim();
    if (!normalizedEmail) {
        return { success: false, message: 'Please enter your email address first.' };
    }

    try {
        await sendPasswordResetEmail(auth, normalizedEmail, {
            url: `${window.location.origin}/`
        });
        return { success: true, message: 'Password reset link sent. Check your email inbox.' };
    } catch (error) {
        const errorCode = error.code;
        const errorMessage = getAuthErrorMessage(errorCode, error.message);
        return { success: false, message: `${errorMessage}${errorCode ? ` (Code: ${errorCode})` : ''}` };
    }
}

// Render Auth Form
function renderAuthForm(container, action) {
    const isLogin = action === 'login';
    const setAuthFeedback = (message, type = 'info') => {
        const feedback = document.getElementById('authFeedback');
        if (!feedback) {
            alert(message);
            return;
        }

        const colors = {
            success: 'var(--success-color, #27ae60)',
            error: 'var(--error-color, #e74c3c)',
            info: 'var(--text-secondary, #666666)'
        };

        feedback.textContent = message;
        feedback.style.color = colors[type] || colors.info;
        feedback.style.display = 'block';
    };
    const toggleAuthButtons = (disabled) => {
        const buttonIds = ['googleSignInBtn', 'loginBtn', 'registerBtn'];
        buttonIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = disabled;
        });
    };
    
    container.innerHTML = `
        <h2><i class="fas fa-${isLogin ? 'sign-in-alt' : 'user-plus'}"></i> ${isLogin ? 'Login' : 'Register'}</h2>
        
        <!-- Google Sign-In Button -->
        <button class="google-signin-btn" id="googleSignInBtn" style="margin-bottom: 20px;">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style="width:20px;height:20px;margin-right:10px;">
            Continue with Google
        </button>
        
        <div class="auth-divider" style="display:flex;align-items:center;margin:20px 0;color:#888;font-size:0.9em;">
            <span style="flex:1;border-bottom:1px solid #ddd;"></span>
            <span style="padding:0 10px;">or</span>
            <span style="flex:1;border-bottom:1px solid #ddd;"></span>
        </div>
        <p id="authFeedback" role="status" aria-live="polite" style="display:none;margin:8px 0 16px 0;font-size:0.9em;"></p>
        
        ${!isLogin ? `
        <div class="field">
            <label>Enter Email</label>
            <input type="email" id="authEmail" placeholder="Enter your email" required>
        </div>
        <div class="field">
            <label>Username</label>
            <input type="text" id="authUsername" placeholder="Choose a username" required>
        </div>
        <div class="field">
            <label>Enter Password</label>
            <input type="password" id="authPassword" placeholder="Create a password" required minlength="6">
        </div>
        <div class="field">
            <label>Confirm Password</label>
            <input type="password" id="authConfirmPassword" placeholder="Confirm your password" required minlength="6">
        </div>
        <button class="joker-submit" id="registerBtn">REGISTER</button>
        ` : `
        <div class="field">
            <label>Enter Email</label>
            <input type="email" id="authEmail" placeholder="Enter your email" required>
        </div>
        <div class="field">
            <label>Enter Password</label>
            <input type="password" id="authPassword" placeholder="Enter your password" required>
        </div>
        <button class="joker-submit" id="loginBtn">LOGIN</button>
        <p style="text-align:center;margin-top:16px;font-size:0.9em;">
            <a href="#" id="forgotPasswordLink" style="color:var(--primary-color);text-decoration:none;">Forgot Password?</a>
        </p>
        `}
    `;
    
    // Add Google Sign-In event listener
    document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
        try {
            toggleAuthButtons(true);
            const result = await signInWithGoogle();
            if (result.success && result.redirecting) {
                setAuthFeedback(result.message, 'info');
            } else if (result.success) {
                setAuthFeedback(result.message, 'success');
                showProfileAfterAuthSuccess(result.message);
            } else {
                setAuthFeedback('Google sign-in failed: ' + result.message, 'error');
                alert('Google sign-in failed: ' + result.message);
            }
        } catch (error) {
            const msg = getAuthErrorMessage(error?.code, error?.message);
            setAuthFeedback(msg, 'error');
            alert(msg);
        } finally {
            toggleAuthButtons(false);
        }
    });
    
    // Add event listeners
    if (isLogin) {
        document.getElementById('loginBtn')?.addEventListener('click', async () => {
            const email = document.getElementById('authEmail')?.value;
            const password = document.getElementById('authPassword')?.value;
            
            if (!email || !password) {
                setAuthFeedback('Please fill in all fields.', 'error');
                return;
            }

            try {
                toggleAuthButtons(true);
                const result = await loginUser(email, password);
                setAuthFeedback(result.message, result.success ? 'success' : 'error');
                if (result.success) {
                    showProfileAfterAuthSuccess(result.message);
                } else {
                    alert(result.message);
                }
            } catch (error) {
                const msg = getAuthErrorMessage(error?.code, error?.message);
                setAuthFeedback(msg, 'error');
                alert(msg);
            } finally {
                toggleAuthButtons(false);
            }
        });

        document.getElementById('forgotPasswordLink')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const enteredEmail = document.getElementById('authEmail')?.value?.trim();
            try {
                const result = await requestPasswordReset(enteredEmail);
                setAuthFeedback(result.message, result.success ? 'success' : 'error');
                if (!result.success) {
                    alert(result.message);
                }
            } catch (error) {
                const msg = getAuthErrorMessage(error?.code, error?.message);
                setAuthFeedback(msg, 'error');
                alert(msg);
            }
        });
    } else {
        document.getElementById('registerBtn')?.addEventListener('click', async () => {
            const email = document.getElementById('authEmail')?.value;
            const username = document.getElementById('authUsername')?.value;
            const password = document.getElementById('authPassword')?.value;
            const confirmPassword = document.getElementById('authConfirmPassword')?.value;
            
            if (!email || !username || !password || !confirmPassword) {
                setAuthFeedback('Please fill in all fields.', 'error');
                return;
            }
            
            if (password !== confirmPassword) {
                setAuthFeedback('Passwords do not match.', 'error');
                return;
            }
            
            if (password.length < 6) {
                setAuthFeedback('Password must be at least 6 characters.', 'error');
                return;
            }

            try {
                toggleAuthButtons(true);
                const result = await registerUser(email, username, password);
                setAuthFeedback(result.message, result.success ? 'success' : 'error');
                if (result.success) {
                    showProfileAfterAuthSuccess(result.message);
                } else {
                    alert(result.message);
                }
            } catch (error) {
                const msg = getAuthErrorMessage(error?.code, error?.message);
                setAuthFeedback(msg, 'error');
                alert(msg);
            } finally {
                toggleAuthButtons(false);
            }
        });
    }
}

// ============================================
// ARCHITECT MODE - Resize Handles (Phase 4)
// ============================================

// Initialize resize handles for an element
function initResizeHandles(element, options = {}) {
    if (!element) return;
    
    const defaultOptions = {
        minWidth: 100,
        minHeight: 60,
        maxWidth: null,
        maxHeight: null,
        onResize: null
    };
    
    const opts = { ...defaultOptions, ...options };
    
    element.classList.add('resizable');
    
    // Create handle elements
    const positions = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
    positions.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${pos}`;
        handle.dataset.position = pos;
        element.appendChild(handle);
        
        handle.addEventListener('mousedown', (e) => startResize(e, element, pos, opts));
        handle.addEventListener('touchstart', (e) => startResize(e, element, pos, opts), { passive: true });
    });
}

// Start resize operation
function startResize(e, element, position, options) {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    const startWidth = element.offsetWidth;
    const startHeight = element.offsetHeight;
    const startLeft = element.offsetLeft;
    const startTop = element.offsetTop;
    
    element.classList.add('resizing');
    
    const onMove = (clientX, clientY) => {
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;
        
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        
        if (position.includes('e')) newWidth = Math.max(options.minWidth, startWidth + deltaX);
        if (position.includes('w')) {
            newWidth = Math.max(options.minWidth, startWidth - deltaX);
            newLeft = startLeft + (startWidth - newWidth);
        }
        if (position.includes('s')) newHeight = Math.max(options.minHeight, startHeight + deltaY);
        if (position.includes('n')) {
            newHeight = Math.max(options.minHeight, startHeight - deltaY);
            newTop = startTop + (startHeight - newHeight);
        }
        
        if (options.maxWidth && newWidth > options.maxWidth) newWidth = options.maxWidth;
        if (options.maxHeight && newHeight > options.maxHeight) newHeight = options.maxHeight;
        
        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';
        if (position.includes('w')) element.style.left = newLeft + 'px';
        if (position.includes('n')) element.style.top = newTop + 'px';
        
        if (options.onResize) {
            options.onResize({ width: newWidth, height: newHeight, x: newLeft, y: newTop });
        }
    };
    
    const onEnd = () => {
        element.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchend', onEnd);
        
        // Save new dimensions
        saveElementPosition(element);
    };
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
}

// ============================================
// DRAG AND DROP - Priority Dragging (Phase 4)
// ============================================

// Make element draggable
function makeDraggable(element, options = {}) {
    if (!element) return;
    
    element.classList.add('draggable');
    element.setAttribute('draggable', 'true');
    
    element.addEventListener('dragstart', (e) => {
        element.classList.add('dragging');
        e.dataTransfer.setData('text/plain', element.id || 'draggable-element');
        e.dataTransfer.effectAllowed = 'move';
        
        if (options.onDragStart) options.onDragStart(e);
    });
    
    element.addEventListener('dragend', () => {
        element.classList.remove('dragging');
        if (options.onDragEnd) options.onDragEnd();
    });
}

// Initialize drop zone
function initDropZone(zone, options = {}) {
    if (!zone) return;
    
    zone.classList.add('drop-zone');
    if (!zone.id) zone.id = 'drop-zone-' + Date.now();
    
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');
        if (options.onDragOver) options.onDragOver(e);
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
        if (options.onDragLeave) options.onDragLeave();
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        
        const data = e.dataTransfer.getData('text/plain');
        const draggable = document.querySelector(`.dragging`);
        
        if (draggable && zone !== draggable) {
            zone.appendChild(draggable);
            if (options.onDrop) options.onDrop(draggable, zone);
        }
        
        if (options.onComplete) options.onComplete();
    });
}

// ============================================
// ETERNAL MEMORY - Save/Load Positions (Phase 5)
// ============================================

// Save element position and dimensions
function saveElementPosition(element) {
    if (!element) return;

    const id = element.id || 'unknown';
    const position = {
        x: element.offsetLeft,
        y: element.offsetTop,
        width: element.offsetWidth,
        height: element.offsetHeight,
        parentId: element.parentElement ? element.parentElement.id : null
    };

    let savedPositions = JSON.parse(localStorage.getItem('ruiruElementPositions') || '{}');
    savedPositions[id] = position;
    localStorage.setItem('ruiruElementPositions', JSON.stringify(savedPositions));
}

// Load element position
function loadElementPosition(element) {
    if (!element) return;
    
    const id = element.id || 'unknown';
    const savedPositions = JSON.parse(localStorage.getItem('ruiruElementPositions') || '{}');
    const position = savedPositions[id];
    
    if (position) {
        if (position.x !== undefined) element.style.left = position.x + 'px';
        if (position.y !== undefined) element.style.top = position.y + 'px';
        if (position.width) element.style.width = position.width + 'px';
        if (position.height) element.style.height = position.height + 'px';
        return true;
    }
    return false;
}

// Save all settings
function saveAllSettings() {
    saveSettings();
    
    // Save player dimensions
    const player = document.querySelector('.main-player-view, .hero-player-content');
    if (player) {
        saveElementPosition(player);
    }
}

// Load all settings on page load
function loadAllSettings() {
    loadSettings();

    // Load player positions
    document.querySelectorAll('.main-player-view, .hero-player-content').forEach(el => {
        loadElementPosition(el);
    });

    // Load draggable element positions
    const draggableElements = document.querySelectorAll('#player-title, #player-description');
    draggableElements.forEach(el => {
        loadElementPosition(el);
    });
}

// Initialize all Joker functionality
function initJokerSettings() {
    // Load saved settings
    loadAllSettings();

    // Load saved profile
    loadProfile();

    // Apply saved customization
    applyCustomization();

    // Add Joker command listeners (desktop)
    document.querySelectorAll('.joker-cmd[data-action]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const action = ev.currentTarget.dataset.action;
            settingsState.currentAction = action;
            updateJokerMenu(ev.currentTarget);
            renderJokerDetails(action);
        });
    });

    // Add mobile icon row listeners
    document.querySelectorAll('.joker-mobile-icon-container[data-action]').forEach(icon => {
        icon.addEventListener('click', (ev) => {
            const action = ev.currentTarget.dataset.action;
            settingsState.currentAction = action;
            
            // Sync desktop buttons
            const desktopBtn = document.querySelector(`.joker-cmd[data-action="${action}"]`);
            updateJokerMenu(desktopBtn);
            
            // Render details
            renderJokerDetails(action);
        });
    });

    // Initialize mobile icon active state based on current action
    const currentAction = settingsState.currentAction || 'profile';
    const activeMobileIcon = document.querySelector(`.joker-mobile-icon-container[data-action="${currentAction}"]`);
    if (activeMobileIcon) {
        activeMobileIcon.classList.add('active');
    }

    // Initialize resize handles on player elements
    const playerElements = document.querySelectorAll('.main-player-view, .hero-player-content, .video-container');
    playerElements.forEach(el => {
        initResizeHandles(el, {
            minWidth: 200,
            minHeight: 120,
            onResize: (pos) => {
                saveElementPosition(el);
            }
        });
    });

    // Initialize draggable on title and description
    const titleEl = document.querySelector('#playerDetails h3, .player-details h3');
    const descEl = document.querySelector('#playerDetails p, .player-details p');

    if (titleEl && !titleEl.id) titleEl.id = 'player-title';
    if (descEl && !descEl.id) descEl.id = 'player-description';

    [titleEl, descEl].forEach(el => {
        if (el) {
            makeDraggable(el, {
                onDragStart: () => {
                    document.body.classList.add('dragging-active');
                },
                onDragEnd: () => {
                    document.body.classList.remove('dragging-active');
                    saveElementPosition(el);
                }
            });
        }
    });

    // Initialize drop zones for architect mode
    initDropZones();
}

// Initialize drop zones for architect mode
function initDropZones() {
    // Create drop zones for different "houses"
    const houses = [
        { id: 'queen-drop', label: 'Queen (Header)', selector: '.main-header' },
        { id: 'prince-drop', label: 'Prince (Player)', selector: '.main-player-view, .hero-player-content' },
        { id: 'subjects-drop', label: 'Subjects (Playlist)', selector: '.video-playlist-sidebar' }
    ];

    houses.forEach(house => {
        const targetEl = document.querySelector(house.selector);
        if (targetEl) {
            initDropZone(targetEl, {
                onDrop: (draggedEl, dropZone) => {
                    // Move the dragged element to the drop zone
                    dropZone.appendChild(draggedEl);
                    saveElementPosition(draggedEl);
                },
                onDragOver: () => {
                    targetEl.classList.add('drop-zone-highlight');
                },
                onDragLeave: () => {
                    targetEl.classList.remove('drop-zone-highlight');
                }
            });
        }
    });
}

// Auto-save on page unload
window.addEventListener('beforeunload', () => {
    saveAllSettings();
});

// Global YouTube player instances
let youtubePlayers = {};

// Auto-play functions

/**
 * Initialize autoplay functionality
 * Should be called on page load
 */
function initializeAutoplay() {
    console.log('Initializing autoplay...');
    
    // Load saved autoplay setting from localStorage
    loadAutoplaySetting();
    
    // Add autoplay toggle to playlist header if playlist exists
    addAutoplayToggle();
    
    console.log('Autoplay initialized. Enabled:', autoplayEnabled);
}

function setupAutoplay(playerElement, currentVideoId) {
    if (!autoplayEnabled) {
        console.log('Autoplay disabled, skipping setup');
        return;
    }

    // Check if it's a YouTube iframe
    if (playerElement.tagName === 'IFRAME' && playerElement.src.includes('youtube.com')) {
        // Set current video ID on the player container for tracking
        const playerContainer = getPlayerContainer();
        if (playerContainer) {
            playerContainer.dataset.currentVideoId = currentVideoId;
        }
        // Initialize YouTube player for autoplay
        initializeYouTubePlayer(playerElement, currentVideoId);
    }
    // For HTML5 videos, the 'ended' event listener is already added in populateMainPlayer
}

function playNextVideo(currentVideoId) {
    if (!autoplayEnabled || currentPlaylist.length === 0) {
        console.log('Cannot play next: autoplayEnabled=', autoplayEnabled, 'playlist length=', currentPlaylist.length);
        return;
    }

    // Find current video index
    const currentIndex = currentPlaylist.findIndex(doc => doc.id === currentVideoId);
    if (currentIndex === -1) {
        console.log('Current video not found in playlist');
        return;
    }

    // Get next video (loop back to first)
    const nextIndex = (currentIndex + 1) % currentPlaylist.length;
    const nextVideo = currentPlaylist[nextIndex];
    
    console.log('Playing next video:', nextVideo.id);

    // Update player
    populateMainPlayer(nextVideo);
    const playerContainer = getPlayerContainer();
    if (playerContainer) {
        playerContainer.dataset.currentVideoId = nextVideo.id;
    }

    // Update playlist highlight
    updatePlaylistHighlight(nextVideo.id);
}

function updatePlaylistHighlight(videoId) {
    // Remove previous highlights
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('playing');
    });

    // Highlight current video
    const currentItem = document.querySelector(`.playlist-item[data-video-id="${videoId}"]`);
    if (currentItem) {
        currentItem.classList.add('playing');
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Add autoplay toggle to playlist header
function addAutoplayToggle() {
    const playlistBoundary = document.querySelector('.playlist-boundary');
    if (!playlistBoundary) {
        console.log('Playlist boundary not found, skipping autoplay toggle');
        return;
    }

    // Check if toggle already exists
    if (playlistBoundary.querySelector('.autoplay-toggle')) {
        console.log('Autoplay toggle already exists');
        return;
    }

    const autoplayToggle = document.createElement('div');
    autoplayToggle.className = 'autoplay-toggle';
    autoplayToggle.innerHTML = `
        <button id="autoplayBtn" class="autoplay-btn ${autoplayEnabled ? 'active' : ''}" title="Toggle Auto-play">
            <i class="fas fa-play-circle"></i>
            <span>Auto-play</span>
        </button>
    `;

    // Insert at the top of the playlist boundary (fixed header position)
    playlistBoundary.insertBefore(autoplayToggle, playlistBoundary.firstChild);
    console.log('Autoplay toggle added');

    // Add event listener
    const btn = document.getElementById('autoplayBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            autoplayEnabled = !autoplayEnabled;
            btn.classList.toggle('active');
            localStorage.setItem('autoplayEnabled', autoplayEnabled);
            console.log('Autoplay toggled:', autoplayEnabled);
        });
    }
}

// Load autoplay setting
function loadAutoplaySetting() {
    const saved = localStorage.getItem('autoplayEnabled');
    if (saved !== null) {
        autoplayEnabled = saved === 'true';
        console.log('Loaded autoplay setting:', autoplayEnabled);
    } else {
        // Default to true if not set
        autoplayEnabled = true;
        console.log('Autoplay setting not found, defaulting to true');
    }
}

// YouTube API ready callback
function onYouTubeIframeAPIReady() {
    console.log('YouTube API ready');
    // This will be called when the API is loaded
}

// Make the callback global so YouTube API can call it
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// Function to initialize YouTube player for autoplay
function initializeYouTubePlayer(iframe, currentVideoId) {
    if (!iframe || !iframe.getAttribute('data-yt-id')) {
        console.log('Invalid iframe or missing yt-id');
        return;
    }

    const ytId = iframe.getAttribute('data-yt-id');

    // Wait for YouTube API to be ready
    if (typeof YT === 'undefined' || !YT.Player) {
        console.log('YouTube API not ready, retrying...');
        setTimeout(() => initializeYouTubePlayer(iframe, currentVideoId), 100);
        return;
    }

    if (youtubePlayers[ytId]) {
        console.log('Player already exists for', ytId);
        // Update the video ID on existing player
        const playerContainer = getPlayerContainer();
        if (playerContainer) {
            playerContainer.dataset.currentVideoId = currentVideoId;
        }
        return;
    }

    try {
        console.log('Initializing YouTube player for', ytId, 'videoId:', currentVideoId);
        
        const player = new YT.Player(iframe, {
            events: {
                'onReady': (event) => {
                    console.log('YouTube player ready for', ytId);
                },
                'onStateChange': (event) => {
                    console.log('YouTube state change:', event.data, 'for', ytId);
                    // YT.PlayerState: UNSTARTED = -1, ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5
                    if (event.data === 0 && autoplayEnabled) { // Video ended
                        // Get current video ID from player container (more reliable)
                        const playerContainer = getPlayerContainer();
                        const playingVideoId = playerContainer?.dataset.currentVideoId || currentVideoId;
                        console.log('Video ended, playing next for video:', playingVideoId);
                        playNextVideo(playingVideoId);
                    }
                },
                'onError': (event) => {
                    console.error('YouTube player error:', event.data, 'for', ytId);
                    // On error, try to play next video
                    if (autoplayEnabled) {
                        console.log('Error occurred, trying to play next video');
                        playNextVideo(currentVideoId);
                    }
                }
            }
        });
        youtubePlayers[ytId] = player;
    } catch (e) {
        console.warn('Failed to initialize YouTube player for', ytId, e);
    }
}

// -----------------------------
// Connect YouTube Button Logic (Admin Only)
// -----------------------------
const connectBtn = document.getElementById("connectYoutube");
if (connectBtn) {
  connectBtn.addEventListener("click", async () => {
    // Double-check admin status before allowing OAuth
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      alert("Access denied. Only admins can connect YouTube.");
      return;
    }
    
    const CLIENT_ID = "60484045851-nq8loe52iv5m66svlam52jj883pjgcld.apps.googleusercontent.com";
    const REDIRECT_URI = "https://insight-viewer.vercel.app/api/oauthCallback";
    const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
    const RESPONSE_TYPE = "code";
    const ACCESS_TYPE = "offline";

    const oauthURL = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&response_type=${RESPONSE_TYPE}&access_type=${ACCESS_TYPE}`;

    // Redirect admin to Google OAuth page
    window.location.href = oauthURL;
  });
}

// -----------------------------
// YouTube Videos Fetch Button Logic
// -----------------------------
const fetchBtn = document.getElementById("fetchYoutubeVideos");
if (fetchBtn) {
  fetchBtn.addEventListener("click", async () => {
    // Double-check admin status before allowing fetch
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      alert("Access denied. Only admins can fetch YouTube videos.");
      return;
    }
    
    try {
      const response = await fetch("/api/fetchYouTubeVideos");
      const data = await response.json();
      
      if (data.success) {
        // Mark sync as completed after successful fetch
        await markYouTubeSyncCompleted();
        alert(`YouTube videos synced! Total fetched: ${data.count}`);
        
        // Hide the button after successful sync
        updateConnectYouTubeButtonVisibility();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error fetching YouTube videos. Check console.");
    }
  });
}

// -----------------------------
// Auth State Change Listener
// -----------------------------
// Listen for auth state changes to update button visibility
onAuthStateChanged(auth, async (user) => {
  console.log("Auth state changed:", user ? user.email : "No user");
  latestProfileLoadRequestId += 1;
  
  // Update button visibility when auth state changes
  await updateConnectYouTubeButtonVisibility();
  if (user) {
    if (currentProfileUid !== user.uid) {
      resetProfileState();
      settingsState.profile.email = user.email || '';
      applyProfileStateToForm();
    }
    await loadProfileFromBackend(user);
  } else {
    resetProfileState();
    loadProfile();
  }
});

// -----------------------------
// Initialize Button Visibility on Page Load
// -----------------------------
async function initializeYouTubeButton() {
  // Wait a bit for auth to initialize
  setTimeout(async () => {
    await updateConnectYouTubeButtonVisibility();
  }, 1000);
}

// Run initialization
initializeYouTubeButton();

// Export functions for external use (if needed)
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.isYouTubeSyncCompleted = isYouTubeSyncCompleted;
window.shouldShowConnectYouTubeButton = shouldShowConnectYouTubeButton;
window.updateConnectYouTubeButtonVisibility = updateConnectYouTubeButtonVisibility;
