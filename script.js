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

// Import Firebase functions from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// Initialize Firebase app and Firestore database instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const contentCollectionRef = collection(db, "content_items");

// --- Global Variables and DOM Elements ---
let activeSection = 'home';
let currentSearchTerm = '';
let currentFilterDate = null; // Stores the selected date filter (YYYY-MM-DD)

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
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebarWrapper.classList.toggle('active');
        });
    }

    // --- Navigation and Content Switching Logic ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
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

            // Load content for the selected section (unless it's home)
            if (activeSection !== 'home') {
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


    // --- Initial Page Load ---
    // Simulate clicking the home nav item to load initial content
    const initialNavItem = document.querySelector('.nav-item[data-section="home"]');
    if (initialNavItem) {
        initialNavItem.click();
    }
});

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
                    renderContentItem(docItem, contentContainer);
                });
            });

        } else { // If a specific date is filtered, just render all filtered docs
            filteredDocs.forEach(docItem => {
                renderContentItem(docItem, contentContainer);
            });
        }

    }, (error) => {
        console.error("Error fetching documents from Firestore: ", error);
        contentContainer.innerHTML = '<p class="text-center-message">Error loading content. Please check your internet connection and Firebase rules.</p>';
    });
}

/**
 * Renders a single content item into the specified container.
 * @param {Object} docItem - The document object from Firestore ({id, data}).
 * @param {HTMLElement} container - The DOM element to append the content item to.
 */
function renderContentItem(docItem, container) {
    const item = docItem.data;
    const contentItemDiv = document.createElement('div');
    contentItemDiv.classList.add('content-item');

    let mediaContent = '';
    const youtubeId = item.url ? getYouTubeVideoId(item.url) : null;

    if (youtubeId) {
        mediaContent = `
            <div class="video-container">
                <iframe
                    src="https://www.youtube.com/embed/${youtubeId}?rel=0"
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
}