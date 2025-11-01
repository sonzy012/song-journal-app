const CLIENT_ID = '878760682259-ls7ioius3u19hhultrr9k25f2daoen9v.apps.googleusercontent.com';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar.readonly';

let tokenClient;
let accessToken = null;
let folderId = null;
let entriesCache = [];
let isLoading = false;

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    // OAuth only, no API key needed
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
            if (response.error) {
                alert('Error: ' + response.error);
                return;
            }
            if (response.access_token) {
                accessToken = response.access_token;
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('tokenExpiry', Date.now() + 3600000);
                localStorage.setItem('grantedScopes', response.scope || SCOPES);
                onSignIn();
            }
        },
    });
    
    checkStoredToken();
}

function checkStoredToken() {
    const storedToken = localStorage.getItem('accessToken');
    const expiry = localStorage.getItem('tokenExpiry');
    const storedScopes = localStorage.getItem('grantedScopes');
    const requiredScopes = SCOPES.split(' ');
    const hasAllScopes = requiredScopes.every(scope => storedScopes && storedScopes.includes(scope));
    
    if (storedToken && expiry && Date.now() < expiry && hasAllScopes) {
        accessToken = storedToken;
        onSignIn();
    } else if (storedToken && !hasAllScopes) {
        localStorage.clear();
    }
}

document.getElementById('signInBtn').onclick = () => {
    tokenClient.requestAccessToken({ prompt: 'consent' });
};

document.getElementById('signOutBtn').onclick = () => {
    if (confirm('Sign out?')) {
        accessToken = null;
        localStorage.clear();
        document.getElementById('signInScreen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        location.reload();
    }
};

document.getElementById('newEntryBtn').onclick = () => {
    selectedDate = null;
    editingEntryId = null;
    const modal = document.getElementById('editorModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('entryTitle')?.focus();
    }
};

let mediaFiles = [];
let selectedLocation = null;
let entryTags = [];
let editingEntryId = null;
let existingMedia = [];
let savedLocations = [];
let calendarEvents = [];
let selectedCalendarId = 'primary';
let currentEventsPage = 0;
const EVENTS_PER_PAGE = 20;
let eventsSortOrder = 'desc';

document.getElementById('cancelBtn').onclick = () => {
    document.getElementById('editorModal').classList.remove('active');
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryContent').value = '';
    document.getElementById('mediaPreview').innerHTML = '';
    document.getElementById('locationPreview').innerHTML = '';
    document.getElementById('tagInput').value = '';
    document.getElementById('tagsPreview').innerHTML = '';
    mediaFiles = [];
    selectedLocation = null;
    entryTags = [];
    editingEntryId = null;
    existingMedia = [];
    if (document.getElementById('calendarView').style.display === 'none') {
        selectedDate = null;
    }
};

document.getElementById('tagInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const tag = e.target.value.trim().toLowerCase();
        if (tag && !entryTags.includes(tag)) {
            entryTags.push(tag);
            updateTagsPreview();
            e.target.value = '';
        }
    }
};

function updateTagsPreview() {
    const preview = document.getElementById('tagsPreview');
    preview.innerHTML = '';
    entryTags.forEach((tag, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'tag-item';
        tagEl.innerHTML = `
            <span>${tag}</span>
            <button class="tag-remove" onclick="removeTag(${index})">×</button>
        `;
        preview.appendChild(tagEl);
    });
}

window.removeTag = function(index) {
    entryTags.splice(index, 1);
    updateTagsPreview();
};

function generateAutoTags(title, content, location) {
    const tags = [];
    const text = (title + ' ' + content).toLowerCase();
    
    const categories = {
        food: ['food', 'eat', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'coffee', 'meal', 'cooking', 'recipe'],
        travel: ['travel', 'trip', 'vacation', 'flight', 'hotel', 'airport', 'visit', 'tour', 'journey'],
        work: ['work', 'meeting', 'office', 'project', 'deadline', 'presentation', 'conference', 'client'],
        fitness: ['gym', 'workout', 'exercise', 'run', 'yoga', 'fitness', 'training', 'sport'],
        family: ['family', 'mom', 'dad', 'sister', 'brother', 'parent', 'child', 'kids'],
        friends: ['friend', 'hangout', 'party', 'celebration', 'birthday'],
        nature: ['park', 'beach', 'mountain', 'hiking', 'nature', 'outdoor', 'forest', 'lake'],
        shopping: ['shopping', 'store', 'buy', 'purchase', 'mall'],
        entertainment: ['movie', 'concert', 'show', 'music', 'game', 'fun']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => text.includes(keyword))) {
            tags.push(category);
        }
    }
    
    if (location) {
        const locText = (location.name + ' ' + location.address).toLowerCase();
        if (locText.includes('restaurant') || locText.includes('cafe')) tags.push('food');
        if (locText.includes('park') || locText.includes('beach')) tags.push('nature');
        if (locText.includes('gym')) tags.push('fitness');
    }
    
    return [...new Set(tags)];
};

document.getElementById('addMediaBtn').onclick = () => {
    document.getElementById('mediaInput').click();
};

document.getElementById('addLocationBtn').onclick = () => {
    showLocationPicker();
};

document.getElementById('savedLocationSelect').onchange = (e) => {
    const locationId = e.target.value;
    if (locationId) {
        const location = savedLocations.find(loc => loc.id === locationId);
        if (location) {
            selectedLocation = { ...location };
            delete selectedLocation.id;
            updateLocationPreview();
        }
    }
};

document.getElementById('addSavedLocationBtn').onclick = () => {
    showLocationPicker(true);
};

function updateLocationPreview() {
    const preview = document.getElementById('locationPreview');
    if (selectedLocation && preview) {
        preview.innerHTML = `
            <div class="location-item">
                <span>📍 ${selectedLocation.name}</span>
                <button onclick="removeLocation()" style="background:none;border:none;color:#ff3b30;cursor:pointer;">×</button>
            </div>
        `;
    }
}

function showLocationPicker(saveMode = false) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            <div class="modal-header">
                <button class="btn-text" onclick="this.closest('.modal').remove()">Cancel</button>
                <h3 style="margin:0;">${saveMode ? 'Save Location' : 'Add Location'}</h3>
                <button class="btn-text" onclick="confirmLocation(${saveMode})">Done</button>
            </div>
            <input type="text" id="locationSearch" placeholder="Search for a place..." style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;margin:16px 0;">
            <div id="map" style="width:100%;height:400px;border-radius:8px;background:#f0f0f0;"></div>
        </div>
    `;
    document.body.appendChild(modal);
    
    if (typeof google !== 'undefined' && google.maps) {
        setTimeout(() => initMap(), 300);
    } else {
        alert('Google Maps is loading... Please try again in a moment.');
        modal.remove();
    }
}

let map, marker;

function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    
    const defaultLocation = { lat: 40.7128, lng: -74.0060 };
    
    try {
        map = new google.maps.Map(mapEl, {
            center: defaultLocation,
            zoom: 13
        });
        
        marker = new google.maps.Marker({
            map: map,
            position: defaultLocation,
            draggable: true
        });
        
        const input = document.getElementById('locationSearch');
        const autocomplete = new google.maps.places.Autocomplete(input);
        autocomplete.bindTo('bounds', map);
        
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry) {
                map.setCenter(place.geometry.location);
                marker.setPosition(place.geometry.location);
                
                let photoUrl = null;
                if (place.photos && place.photos.length > 0) {
                    photoUrl = place.photos[0].getUrl({ maxWidth: 1200, maxHeight: 800 });
                }
                
                selectedLocation = {
                    name: place.name || 'Selected Location',
                    address: place.formatted_address || '',
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    photo: photoUrl,
                    placeId: place.place_id
                };
            }
        });
        
        marker.addListener('dragend', () => {
            const pos = marker.getPosition();
            selectedLocation = {
                name: 'Custom Location',
                address: `${pos.lat().toFixed(6)}, ${pos.lng().toFixed(6)}`,
                lat: pos.lat(),
                lng: pos.lng()
            };
        });
    } catch (error) {
        console.error('Map error:', error);
        mapEl.innerHTML = '<p style="padding:20px;text-align:center;">Error loading map. Please refresh and try again.</p>';
    }
}

window.confirmLocation = async function(saveMode = false) {
    const locationModal = document.querySelector('.modal:not(#editorModal)');
    if (selectedLocation) {
        if (saveMode) {
            await saveSavedLocation(selectedLocation);
            selectedLocation = null;
        } else {
            updateLocationPreview();
        }
    }
    if (locationModal) locationModal.remove();
};

function removeLocation() {
    selectedLocation = null;
    document.getElementById('locationPreview').innerHTML = '';
}

document.getElementById('mediaInput').onchange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            mediaFiles.push(file);
            addMediaPreview(file);
        }
    });
    e.target.value = '';
};

function addMediaPreview(file) {
    const preview = document.getElementById('mediaPreview');
    const item = document.createElement('div');
    item.className = 'media-item';
    const currentIndex = mediaFiles.length - 1;
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            item.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button class="media-remove">×</button>
            `;
            item.querySelector('.media-remove').onclick = () => removeMedia(currentIndex);
        };
        reader.readAsDataURL(file);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const video = document.createElement('video');
            video.src = e.target.result;
            video.muted = true;
            video.onloadeddata = () => {
                video.currentTime = 1;
            };
            video.onseeked = () => {
                item.innerHTML = '';
                item.appendChild(video);
                const btn = document.createElement('button');
                btn.className = 'media-remove';
                btn.textContent = '×';
                btn.onclick = () => removeMedia(currentIndex);
                item.appendChild(btn);
                const playIcon = document.createElement('div');
                playIcon.className = 'play-icon';
                playIcon.textContent = '▶';
                item.appendChild(playIcon);
            };
        };
        reader.readAsDataURL(file);
    }
    
    preview.appendChild(item);
}

function removeMedia(index) {
    mediaFiles.splice(index, 1);
    const preview = document.getElementById('mediaPreview');
    preview.children[index].remove();
}

function generateVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        
        video.onloadeddata = () => {
            video.currentTime = 1;
        };
        
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
            URL.revokeObjectURL(video.src);
        };
        
        video.src = URL.createObjectURL(file);
    });
}

document.getElementById('editorModal').onclick = (e) => {
    if (e.target.id === 'editorModal') {
        document.getElementById('cancelBtn').click();
    }
};

async function onSignIn() {
    document.getElementById('signInScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    
    await ensureJournalFolder();
    await loadSavedLocations();
    await loadEntries();
}

async function ensureJournalFolder() {
    const searchUrl = "https://www.googleapis.com/drive/v3/files?q=name='MyJournalApp' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)";
    
    const searchResponse = await fetch(searchUrl, {
        headers: { Authorization: 'Bearer ' + accessToken },
    });
    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
        folderId = searchData.files[0].id;
    } else {
        const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'MyJournalApp',
                mimeType: 'application/vnd.google-apps.folder',
            }),
        });
        const createData = await createResponse.json();
        folderId = createData.id;
    }
}

async function getOrCreateFolder(name, parentId) {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`;
    
    const searchResponse = await fetch(searchUrl, {
        headers: { Authorization: 'Bearer ' + accessToken },
    });
    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        }),
    });
    const createData = await createResponse.json();
    return createData.id;
}

function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

document.getElementById('saveBtn').onclick = async () => {
    const title = document.getElementById('entryTitle').value.trim();
    const content = document.getElementById('entryContent').value.trim();
    
    if (!title && !content && mediaFiles.length === 0 && !selectedLocation && entryTags.length === 0 && existingMedia.length === 0) {
        alert('Please add at least something to your entry (title, content, photo, location, or tag)');
        return;
    }

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        const now = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const monthName = now.toLocaleString('en-US', { month: 'long' });
        const date = now.toISOString().split('T')[0];
        
        const yearFolderId = await getOrCreateFolder(String(year), folderId);
        const monthFolderId = await getOrCreateFolder(`${month}-${monthName}`, yearFolderId);

        const mediaFolder = await getOrCreateFolder('media', monthFolderId);
        const mediaUrls = [];

        for (const file of mediaFiles) {
            const mediaMetadata = {
                name: `${Date.now()}_${file.name}`,
                parents: [mediaFolder],
            };
            
            const mediaForm = new FormData();
            mediaForm.append('metadata', new Blob([JSON.stringify(mediaMetadata)], { type: 'application/json' }));
            mediaForm.append('file', file);

            const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webContentLink', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + accessToken },
                body: mediaForm,
            });
            const uploadData = await uploadResponse.json();
            
            const mediaItem = {
                id: uploadData.id,
                type: file.type.startsWith('image/') ? 'image' : 'video'
            };
            
            if (mediaItem.type === 'video') {
                mediaItem.thumbnail = await generateVideoThumbnail(file);
            }
            
            mediaUrls.push(mediaItem);
        }

        const autoTags = generateAutoTags(title, content, selectedLocation);
        const allTags = [...new Set([...entryTags, ...autoTags])];
        
        const entry = {
            title: title || 'Untitled',
            content: content || '',
            timestamp: now.toISOString(),
            date: date,
            media: [...existingMedia, ...mediaUrls],
            location: selectedLocation,
            tags: allTags
        };

        if (editingEntryId) {
            const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${editingEntryId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 
                    Authorization: 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: blob,
            });
        } else {
            const titleSlug = title ? slugify(title).substring(0, 50) : 'entry';
            const fileName = `${date}_${titleSlug}.json`;

            const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
            const metadata = {
                name: fileName,
                mimeType: 'application/json',
                parents: [monthFolderId],
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ Authorization: 'Bearer ' + accessToken }),
                body: form,
            });
        }

        document.getElementById('entryTitle').value = '';
        document.getElementById('entryContent').value = '';
        document.getElementById('mediaPreview').innerHTML = '';
        document.getElementById('locationPreview').innerHTML = '';
        document.getElementById('tagInput').value = '';
        document.getElementById('tagsPreview').innerHTML = '';
        mediaFiles = [];
        selectedLocation = null;
        entryTags = [];
        editingEntryId = null;
        existingMedia = [];
        const wasSelectedDate = selectedDate;
        selectedDate = null;
        document.getElementById('editorModal').classList.remove('active');
        entriesCache = [];
        await loadEntries(true);
        
        if (document.getElementById('calendarView').style.display !== 'none') {
            selectedDate = wasSelectedDate;
            renderCalendar();
        }
    } catch (error) {
        console.error('Error saving entry:', error);
        alert('Failed to save entry: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
};

async function loadEntries(forceRefresh = false) {
    if (isLoading) return;
    isLoading = true;

    const entriesList = document.getElementById('entriesList');
    entriesList.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">Loading...</p>';
    
    if (entriesCache.length > 0 && !selectionMode) {
        document.getElementById('selectBtn').style.display = 'block';
    }

    if (!folderId) {
        entriesList.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No entries yet. Tap + to create your first entry.</p>';
        isLoading = false;
        return;
    }

    if (!forceRefresh && entriesCache.length > 0) {
        renderEntries(entriesCache);
        isLoading = false;
        return;
    }

    try {
        const allFiles = [];
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)&orderBy=name desc`;
        
        const response = await fetch(searchUrl, {
            headers: { Authorization: 'Bearer ' + accessToken },
        });
        const data = await response.json();

        if (!data.files || data.files.length === 0) {
            entriesList.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No entries yet. Tap + to create your first entry.</p>';
            isLoading = false;
            return;
        }

        for (const yearFolder of data.files) {
            const monthsUrl = `https://www.googleapis.com/drive/v3/files?q='${yearFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)&orderBy=name desc`;
            const monthsResponse = await fetch(monthsUrl, {
                headers: { Authorization: 'Bearer ' + accessToken },
            });
            const monthsData = await monthsResponse.json();

            if (monthsData.files) {
                for (const monthFolder of monthsData.files) {
                    const filesUrl = `https://www.googleapis.com/drive/v3/files?q='${monthFolder.id}' in parents and name contains '.json' and trashed=false&fields=files(id,name,modifiedTime)&orderBy=name desc`;
                    const filesResponse = await fetch(filesUrl, {
                        headers: { Authorization: 'Bearer ' + accessToken },
                    });
                    const filesData = await filesResponse.json();

                    if (filesData.files) {
                        allFiles.push(...filesData.files);
                    }
                }
            }
        }

        allFiles.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
        
        const entries = await Promise.all(
            allFiles.slice(0, 20).map(async (file) => {
                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                    headers: { Authorization: 'Bearer ' + accessToken },
                });
                const content = await response.json();
                return { ...content, fileId: file.id };
            })
        );

        entriesCache = entries;
        renderEntries(entries);
    } catch (error) {
        console.error('Error loading entries:', error);
        entriesList.innerHTML = '<p style="text-align:center;color:#ff3b30;padding:40px;">Error loading entries. Please refresh.</p>';
    }
    
    isLoading = false;
}

let searchQuery = '';
let selectionMode = false;
let selectedEntries = [];

document.getElementById('searchInput').oninput = (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderEntries(entriesCache);
};

document.getElementById('selectBtn').onclick = () => {
    selectionMode = true;
    selectedEntries = [];
    document.getElementById('selectBtn').style.display = 'none';
    document.getElementById('cancelSelectBtn').style.display = 'block';
    document.getElementById('deleteSelectedBtn').style.display = 'block';
    document.getElementById('newEntryBtn').style.display = 'none';
    document.getElementById('entriesList').classList.add('selection-mode');
    renderEntries(entriesCache);
};

document.getElementById('cancelSelectBtn').onclick = () => {
    selectionMode = false;
    selectedEntries = [];
    document.getElementById('selectBtn').style.display = 'none';
    document.getElementById('cancelSelectBtn').style.display = 'none';
    document.getElementById('deleteSelectedBtn').style.display = 'none';
    document.getElementById('newEntryBtn').style.display = 'block';
    document.getElementById('entriesList').classList.remove('selection-mode');
    renderEntries(entriesCache);
};

document.getElementById('deleteSelectedBtn').onclick = async () => {
    if (selectedEntries.length === 0) {
        alert('No entries selected');
        return;
    }
    
    if (!confirm(`Delete ${selectedEntries.length} selected entries?`)) return;
    
    for (const fileId of selectedEntries) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + accessToken },
        });
    }
    
    selectionMode = false;
    selectedEntries = [];
    document.getElementById('selectBtn').style.display = 'none';
    document.getElementById('cancelSelectBtn').style.display = 'none';
    document.getElementById('deleteSelectedBtn').style.display = 'none';
    document.getElementById('newEntryBtn').style.display = 'block';
    document.getElementById('entriesList').classList.remove('selection-mode');
    entriesCache = [];
    await loadEntries(true);
};

window.toggleEntrySelection = function(fileId) {
    const index = selectedEntries.indexOf(fileId);
    if (index > -1) {
        selectedEntries.splice(index, 1);
    } else {
        selectedEntries.push(fileId);
    }
    renderEntries(entriesCache);
};

function renderEntries(entries) {
    const entriesList = document.getElementById('entriesList');
    entriesList.innerHTML = '';
    
    let filteredEntries = entries;
    if (searchQuery) {
        filteredEntries = entries.filter(entry => {
            const titleMatch = entry.title.toLowerCase().includes(searchQuery);
            const contentMatch = entry.content.toLowerCase().includes(searchQuery);
            const tagMatch = entry.tags && entry.tags.some(tag => tag.includes(searchQuery));
            const locationMatch = entry.location && 
                (entry.location.name.toLowerCase().includes(searchQuery) || 
                 entry.location.address.toLowerCase().includes(searchQuery));
            return titleMatch || contentMatch || tagMatch || locationMatch;
        });
    }

    for (const entry of filteredEntries) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'entry-card';
        
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const dateKey = entry.date;
        
        let locationHtml = '';
        if (entry.location) {
            const mapLink = encodeURIComponent(entry.location.name || entry.location.address);
            const hasPhoto = entry.location.photo && entry.location.photo.startsWith('http');
            const imageUrl = hasPhoto ? entry.location.photo : `https://maps.googleapis.com/maps/api/staticmap?center=${entry.location.lat},${entry.location.lng}&zoom=14&size=300x300&markers=color:red%7C${entry.location.lat},${entry.location.lng}&key=${CONFIG.MAPS_API_KEY}`;
            locationHtml = `
                <div class="entry-location" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${mapLink}', '_blank')" style="cursor:pointer;padding:8px;background:#f8f8f8;border-radius:8px;margin:8px 0;">
                    <img src="${imageUrl}" alt="${entry.location.name}" loading="lazy" style="width:100%;max-width:250px;aspect-ratio:1;object-fit:cover;border-radius:6px;background:#f0f0f0;">
                    <div style="padding:6px 0;color:#666;font-size:13px;">📍 ${entry.location.name}</div>
                </div>
            `;
        }
        
        let mediaHtml = '';
        if (entry.media && entry.media.length > 0) {
            mediaHtml = '<div class="entry-media">';
            for (const media of entry.media) {
                if (media.type === 'image') {
                    mediaHtml += `<img data-media-id="${media.id}" alt="Photo" loading="lazy" onclick="openMedia('${media.id}', 'image')" style="background:#f0f0f0;">`;
                } else {
                    const thumbStyle = media.thumbnail ? `background-image: url(${media.thumbnail}); background-size: cover; background-position: center;` : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';
                    mediaHtml += `<div class="video-thumbnail" style="${thumbStyle}" onclick="openMedia('${media.id}', 'video')">
                        <div class="play-icon-large">▶</div>
                    </div>`;
                }
            }
            mediaHtml += '</div>';
        }
        
        let tagsHtml = '';
        if (entry.tags && entry.tags.length > 0) {
            tagsHtml = '<div class="entry-tags">';
            entry.tags.forEach(tag => {
                tagsHtml += `<span class="entry-tag" onclick="searchByTag('${tag}')">${tag}</span>`;
            });
            tagsHtml += '</div>';
        }
        
        if (selectedEntries.includes(entry.fileId)) {
            entryDiv.classList.add('selected');
        }
        
        const checkboxHtml = selectionMode ? `<div class="entry-checkbox ${selectedEntries.includes(entry.fileId) ? 'checked' : ''}" onclick="event.stopPropagation();toggleEntrySelection('${entry.fileId}')"></div>` : '';
        
        entryDiv.innerHTML = `
            ${checkboxHtml}
            <div class="entry-date" onclick="event.stopPropagation();${selectionMode ? `toggleEntrySelection('${entry.fileId}')` : `viewDateInCalendar('${dateKey}')`}" style="cursor:pointer;" title="${selectionMode ? 'Select entry' : 'View in calendar'}">${dateStr}</div>
            <div class="entry-title">${entry.title}</div>
            ${tagsHtml}
            ${locationHtml}
            ${mediaHtml}
            <div class="entry-preview">${entry.content}</div>
            <div class="entry-actions" style="${selectionMode ? 'display:none;' : ''}">
                <button class="btn-text" onclick="event.stopPropagation();editEntry('${entry.fileId}')">Edit</button>
                <button class="btn-delete" onclick="event.stopPropagation();deleteEntry('${entry.fileId}')">Delete</button>
            </div>
        `;
        
        if (selectionMode) {
            entryDiv.onclick = () => toggleEntrySelection(entry.fileId);
        }
        entriesList.appendChild(entryDiv);
    }

    if (filteredEntries.length === 0) {
        if (searchQuery) {
            entriesList.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No entries found matching your search.</p>';
        } else {
            entriesList.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No entries yet. Tap + to create your first entry.</p>';
        }
        document.getElementById('selectBtn').style.display = 'none';
    } else {
        if (!selectionMode) {
            document.getElementById('selectBtn').style.display = 'block';
        }
    }
    
    document.querySelectorAll('img[data-media-id]').forEach(img => {
        const mediaId = img.getAttribute('data-media-id');
        fetch(`https://www.googleapis.com/drive/v3/files/${mediaId}?alt=media`, {
            headers: { Authorization: 'Bearer ' + accessToken }
        }).then(r => r.blob()).then(blob => {
            img.src = URL.createObjectURL(blob);
        });
    });
}

async function deleteEntry(fileId) {
    if (!confirm('Delete this entry?')) return;
    
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + accessToken },
    });
    
    entriesCache = [];
    await loadEntries(true);
}

window.openMedia = openMedia;

function openMedia(mediaId, type) {
    const viewer = document.createElement('div');
    viewer.className = 'media-viewer';
    viewer.onclick = () => viewer.remove();
    
    if (type === 'image') {
        const img = document.createElement('img');
        img.alt = 'Photo';
        viewer.appendChild(img);
        
        fetch(`https://www.googleapis.com/drive/v3/files/${mediaId}?alt=media`, {
            headers: { Authorization: 'Bearer ' + accessToken }
        }).then(r => r.blob()).then(blob => {
            img.src = URL.createObjectURL(blob);
        });
    } else {
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        viewer.appendChild(video);
        
        fetch(`https://www.googleapis.com/drive/v3/files/${mediaId}?alt=media`, {
            headers: { Authorization: 'Bearer ' + accessToken }
        }).then(r => r.blob()).then(blob => {
            video.src = URL.createObjectURL(blob);
        });
    }
    
    document.body.appendChild(viewer);
}

let currentCalendarDate = new Date();
let selectedDate = null;

document.getElementById('timelineTab').onclick = () => {
    document.getElementById('timelineTab').classList.add('active');
    document.getElementById('calendarTab').classList.remove('active');
    document.getElementById('locationsTab')?.classList.remove('active');
    document.getElementById('eventsTab')?.classList.remove('active');
    document.getElementById('timelineView').style.display = 'block';
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('locationsView').style.display = 'none';
    document.getElementById('eventsView').style.display = 'none';
};

document.getElementById('calendarTab').onclick = () => {
    document.getElementById('calendarTab').classList.add('active');
    document.getElementById('timelineTab').classList.remove('active');
    document.getElementById('locationsTab')?.classList.remove('active');
    document.getElementById('eventsTab')?.classList.remove('active');
    document.getElementById('timelineView').style.display = 'none';
    document.getElementById('calendarView').style.display = 'block';
    document.getElementById('locationsView').style.display = 'none';
    document.getElementById('eventsView').style.display = 'none';
    renderCalendar();
};

document.getElementById('locationsTab')?.addEventListener('click', () => {
    document.getElementById('locationsTab').classList.add('active');
    document.getElementById('timelineTab').classList.remove('active');
    document.getElementById('calendarTab').classList.remove('active');
    document.getElementById('eventsTab')?.classList.remove('active');
    document.getElementById('timelineView').style.display = 'none';
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('locationsView').style.display = 'block';
    document.getElementById('eventsView').style.display = 'none';
    loadSavedLocations();
});

document.getElementById('eventsTab')?.addEventListener('click', () => {
    document.getElementById('eventsTab').classList.add('active');
    document.getElementById('timelineTab').classList.remove('active');
    document.getElementById('calendarTab').classList.remove('active');
    document.getElementById('locationsTab')?.classList.remove('active');
    document.getElementById('timelineView').style.display = 'none';
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('locationsView').style.display = 'none';
    document.getElementById('eventsView').style.display = 'block';
    currentEventsPage = 0;
    loadCalendarList();
    loadCalendarEvents();
    document.getElementById('sortEventsSelect').onchange = (e) => {
        eventsSortOrder = e.target.value;
        currentEventsPage = 0;
        renderCalendarEvents();
    };
});



document.getElementById('prevMonth').onclick = () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
};

document.getElementById('nextMonth').onclick = () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
};

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    document.getElementById('currentMonth').textContent = 
        new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day header';
        header.textContent = day;
        calendar.appendChild(header);
    });
    
    const entriesByDate = {};
    entriesCache.forEach(entry => {
        if (entry.date) {
            if (!entriesByDate[entry.date]) entriesByDate[entry.date] = [];
            entriesByDate[entry.date].push(entry);
        }
    });
    
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = document.createElement('div');
        day.className = 'calendar-day other-month';
        day.textContent = daysInPrevMonth - i;
        calendar.appendChild(day);
    }
    
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.textContent = day;
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
            dayEl.classList.add('today');
        }
        
        if (entriesByDate[dateStr]) {
            dayEl.classList.add('has-entry');
        }
        
        if (selectedDate === dateStr) {
            dayEl.classList.add('selected');
        }
        
        dayEl.onclick = () => {
            selectedDate = dateStr;
            renderCalendar();
            showDayEntries(dateStr, entriesByDate[dateStr] || []);
        };
        
        calendar.appendChild(dayEl);
    }
    
    const remainingDays = 42 - (firstDay + daysInMonth);
    for (let day = 1; day <= remainingDays; day++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day other-month';
        dayEl.textContent = day;
        calendar.appendChild(dayEl);
    }
    
    if (selectedDate) {
        showDayEntries(selectedDate, entriesByDate[selectedDate] || []);
    } else {
        document.getElementById('dayEntries').innerHTML = 
            '<div class="day-entries-empty">Select a date to view or create entries</div>';
    }
}

function showDayEntries(dateStr, entries) {
    const dayEntries = document.getElementById('dayEntries');
    const date = new Date(dateStr + 'T00:00:00');
    const dateFormatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    if (entries.length === 0) {
        dayEntries.innerHTML = `
            <div class="day-entries-header">${dateFormatted}</div>
            <div class="day-entries-empty">
                No entries for this day
                <br><br>
                <button class="btn-new" onclick="createEntryForDate('${dateStr}')">+ Create Entry</button>
            </div>
        `;
    } else {
        dayEntries.innerHTML = `<div class="day-entries-header">${dateFormatted}</div>`;
        entries.forEach(entry => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'entry-card';
            
            let locationHtml = '';
            if (entry.location) {
                const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${entry.location.lat},${entry.location.lng}&zoom=15&size=400x200&markers=color:red%7C${entry.location.lat},${entry.location.lng}&key=${CONFIG.MAPS_API_KEY}`;
                locationHtml = `
                    <div class="entry-location" onclick="window.open('https://www.google.com/maps?q=${entry.location.lat},${entry.location.lng}', '_blank')" style="cursor:pointer;padding:12px;background:#f8f8f8;border-radius:8px;margin:12px 0;">
                        <img src="${mapUrl}" alt="Map" style="width:100%;border-radius:8px;" onerror="this.style.display='none';this.nextElementSibling.style.background='#e8e8e8';this.nextElementSibling.style.padding='20px';this.nextElementSibling.innerHTML='📍 ${entry.location.name}<br><small style=color:#999>Tap to view on map</small>';">
                        <div style="padding:8px 0;color:#666;">📍 ${entry.location.name}</div>
                    </div>
                `;
            }
            
            let mediaHtml = '';
            if (entry.media && entry.media.length > 0) {
                mediaHtml = '<div class="entry-media">';
                for (const media of entry.media) {
                    if (media.type === 'image') {
                        mediaHtml += `<img data-media-id="${media.id}" alt="Photo" loading="lazy" onclick="openMedia('${media.id}', 'image')" style="background:#f0f0f0;">`;
                    } else {
                        const thumbStyle = media.thumbnail ? `background-image: url(${media.thumbnail}); background-size: cover; background-position: center;` : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';
                        mediaHtml += `<div class="video-thumbnail" style="${thumbStyle}" onclick="openMedia('${media.id}', 'video')">
                            <div class="play-icon-large">▶</div>
                        </div>`;
                    }
                }
                mediaHtml += '</div>';
            }
            
            let tagsHtml = '';
            if (entry.tags && entry.tags.length > 0) {
                tagsHtml = '<div class="entry-tags">';
                entry.tags.forEach(tag => {
                    tagsHtml += `<span class="entry-tag" onclick="searchByTag('${tag}')">${tag}</span>`;
                });
                tagsHtml += '</div>';
            }
            
            entryDiv.innerHTML = `
                <div class="entry-title">${entry.title}</div>
                ${tagsHtml}
                ${locationHtml}
                ${mediaHtml}
                <div class="entry-preview">${entry.content}</div>
                <div class="entry-actions">
                    <button class="btn-text" onclick="event.stopPropagation();editEntry('${entry.fileId}')">Edit</button>
                    <button class="btn-delete" onclick="event.stopPropagation();deleteEntry('${entry.fileId}')">Delete</button>
                </div>
            `;
            dayEntries.appendChild(entryDiv);
        });
        
        document.querySelectorAll('#dayEntries img[data-media-id]').forEach(img => {
            const mediaId = img.getAttribute('data-media-id');
            fetch(`https://www.googleapis.com/drive/v3/files/${mediaId}?alt=media`, {
                headers: { Authorization: 'Bearer ' + accessToken }
            }).then(r => r.blob()).then(blob => {
                img.src = URL.createObjectURL(blob);
            });
        });
    }
}

window.createEntryForDate = function(dateStr) {
    selectedDate = dateStr;
    document.getElementById('editorModal').classList.add('active');
    document.getElementById('entryTitle').focus();
};

window.viewDateInCalendar = function(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    currentCalendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
    selectedDate = dateStr;
    
    document.getElementById('calendarTab').classList.add('active');
    document.getElementById('timelineTab').classList.remove('active');
    document.getElementById('timelineView').style.display = 'none';
    document.getElementById('calendarView').style.display = 'block';
    
    renderCalendar();
};

window.searchByTag = function(tag) {
    document.getElementById('timelineTab').click();
    document.getElementById('searchInput').value = tag;
    searchQuery = tag;
    renderEntries(entriesCache);
    document.getElementById('searchInput').focus();
};

window.editEntry = async function(fileId) {
    const entry = entriesCache.find(e => e.fileId === fileId);
    if (!entry) return;
    
    editingEntryId = fileId;
    selectedDate = entry.date;
    
    document.getElementById('entryTitle').value = entry.title;
    document.getElementById('entryContent').value = entry.content;
    
    if (entry.location) {
        selectedLocation = entry.location;
        document.getElementById('locationPreview').innerHTML = `
            <div class="location-item">
                <span>📍 ${entry.location.name}</span>
                <button onclick="removeLocation()" style="background:none;border:none;color:#ff3b30;cursor:pointer;">×</button>
            </div>
        `;
    }
    
    if (entry.tags) {
        entryTags = [...entry.tags];
        updateTagsPreview();
    }
    
    const mediaPreview = document.getElementById('mediaPreview');
    mediaPreview.innerHTML = '';
    existingMedia = entry.media ? [...entry.media] : [];
    
    if (existingMedia.length > 0) {
        existingMedia.forEach((media, index) => {
            const item = document.createElement('div');
            item.className = 'media-item';
            
            if (media.type === 'image') {
                const img = document.createElement('img');
                img.alt = 'Photo';
                item.appendChild(img);
                
                fetch(`https://www.googleapis.com/drive/v3/files/${media.id}?alt=media`, {
                    headers: { Authorization: 'Bearer ' + accessToken }
                }).then(r => r.blob()).then(blob => {
                    img.src = URL.createObjectURL(blob);
                });
            } else {
                const video = document.createElement('video');
                video.muted = true;
                if (media.thumbnail) {
                    video.poster = media.thumbnail;
                }
                item.appendChild(video);
                
                fetch(`https://www.googleapis.com/drive/v3/files/${media.id}?alt=media`, {
                    headers: { Authorization: 'Bearer ' + accessToken }
                }).then(r => r.blob()).then(blob => {
                    video.src = URL.createObjectURL(blob);
                });
                
                const playIcon = document.createElement('div');
                playIcon.className = 'play-icon';
                playIcon.textContent = '▶';
                item.appendChild(playIcon);
            }
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'media-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = () => removeExistingMedia(index);
            item.appendChild(removeBtn);
            
            mediaPreview.appendChild(item);
        });
    }
    
    document.getElementById('editorModal').classList.add('active');
    document.getElementById('entryTitle').focus();
};

window.removeExistingMedia = function(index) {
    existingMedia.splice(index, 1);
    
    const mediaPreview = document.getElementById('mediaPreview');
    mediaPreview.innerHTML = '';
    
    existingMedia.forEach((media, idx) => {
        const item = document.createElement('div');
        item.className = 'media-item';
        
        if (media.type === 'image') {
            const img = document.createElement('img');
            img.alt = 'Photo';
            item.appendChild(img);
            
            fetch(`https://www.googleapis.com/drive/v3/files/${media.id}?alt=media`, {
                headers: { Authorization: 'Bearer ' + accessToken }
            }).then(r => r.blob()).then(blob => {
                img.src = URL.createObjectURL(blob);
            });
        } else {
            const video = document.createElement('video');
            video.muted = true;
            if (media.thumbnail) {
                video.poster = media.thumbnail;
            }
            item.appendChild(video);
            
            fetch(`https://www.googleapis.com/drive/v3/files/${media.id}?alt=media`, {
                headers: { Authorization: 'Bearer ' + accessToken }
            }).then(r => r.blob()).then(blob => {
                video.src = URL.createObjectURL(blob);
            });
            
            const playIcon = document.createElement('div');
            playIcon.className = 'play-icon';
            playIcon.textContent = '▶';
            item.appendChild(playIcon);
        }
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'media-remove';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => removeExistingMedia(idx);
        item.appendChild(removeBtn);
        
        mediaPreview.appendChild(item);
    });
};

window.onload = () => {
    gapiLoaded();
    gisLoaded();
    
    const selectBtn = document.getElementById('selectBtn');
    const cancelSelectBtn = document.getElementById('cancelSelectBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    
    if (selectBtn) selectBtn.style.display = 'none';
    if (cancelSelectBtn) cancelSelectBtn.style.display = 'none';
    if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'none';
};


async function getOrCreateFile(fileName, parentId) {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${parentId}' in parents and trashed=false&fields=files(id)`;
    const searchResponse = await fetch(searchUrl, {
        headers: { Authorization: 'Bearer ' + accessToken },
    });
    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    const blob = new Blob([JSON.stringify({ locations: [], events: [] }, null, 2)], { type: 'application/json' });
    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [parentId],
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken },
        body: form,
    });
    const createData = await createResponse.json();
    return createData.id;
}

async function loadSavedLocations() {
    if (!folderId) return;
    try {
        const locationsFileId = await getOrCreateFile('saved_locations.json', folderId);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${locationsFileId}?alt=media`, {
            headers: { Authorization: 'Bearer ' + accessToken },
        });
        const data = await response.json();
        savedLocations = data.locations || [];
        updateSavedLocationSelect();
        renderSavedLocations();
    } catch (e) {
        savedLocations = [];
        updateSavedLocationSelect();
    }
}

async function saveSavedLocation(location) {
    const newLocation = {
        id: Date.now().toString(),
        name: location.name,
        address: location.address,
        lat: location.lat,
        lng: location.lng,
        photo: location.photo,
        placeId: location.placeId
    };
    savedLocations.push(newLocation);
    
    const locationsFileId = await getOrCreateFile('saved_locations.json', folderId);
    const blob = new Blob([JSON.stringify({ locations: savedLocations }, null, 2)], { type: 'application/json' });
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${locationsFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: blob,
    });
    
    updateSavedLocationSelect();
    renderSavedLocations();
}

async function deleteSavedLocation(locationId) {
    if (!confirm('Delete this saved location?')) return;
    
    savedLocations = savedLocations.filter(loc => loc.id !== locationId);
    
    const locationsFileId = await getOrCreateFile('saved_locations.json', folderId);
    const blob = new Blob([JSON.stringify({ locations: savedLocations }, null, 2)], { type: 'application/json' });
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${locationsFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: blob,
    });
    
    updateSavedLocationSelect();
    renderSavedLocations();
}

function updateSavedLocationSelect() {
    const select = document.getElementById('savedLocationSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select saved location...</option>';
    savedLocations.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc.id;
        option.textContent = loc.name;
        select.appendChild(option);
    });
    
    select.style.display = savedLocations.length > 0 ? 'block' : 'none';
}

function renderSavedLocations() {
    const list = document.getElementById('savedLocationsList');
    if (!list) return;
    
    if (savedLocations.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No saved locations yet. Tap + to add your favorite places.</p>';
        return;
    }
    
    list.innerHTML = '';
    savedLocations.forEach(location => {
        const card = document.createElement('div');
        card.className = 'entry-card';
        card.style.cursor = 'default';
        
        const hasPhoto = location.photo && location.photo.startsWith('http');
        const imageUrl = hasPhoto ? location.photo : `https://maps.googleapis.com/maps/api/staticmap?center=${location.lat},${location.lng}&zoom=14&size=300x300&markers=color:red%7C${location.lat},${location.lng}&key=${CONFIG.MAPS_API_KEY}`;
        
        card.innerHTML = `
            <div class="entry-title">${location.name}</div>
            <div style="color:#666;font-size:14px;margin:8px 0;">${location.address}</div>
            <img src="${imageUrl}" alt="${location.name}" loading="lazy" style="width:100%;max-width:300px;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#f0f0f0;margin:8px 0;">
            <div class="entry-actions">
                <button class="btn-delete" onclick="deleteSavedLocation('${location.id}')">Delete</button>
            </div>
        `;
        list.appendChild(card);
    });
}

window.deleteSavedLocation = deleteSavedLocation;

async function loadCalendarList() {
    const select = document.getElementById('calendarSelect');
    if (!select) return;
    
    try {
        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { Authorization: 'Bearer ' + accessToken }
        });
        
        if (!response.ok) throw new Error('Failed to load calendars');
        
        const data = await response.json();
        select.innerHTML = '';
        
        if (data.items) {
            data.items.forEach(cal => {
                const option = document.createElement('option');
                option.value = cal.id;
                option.textContent = cal.summary;
                if (cal.primary) {
                    option.selected = true;
                    selectedCalendarId = cal.id;
                }
                select.appendChild(option);
            });
        }
        
        select.onchange = (e) => {
            selectedCalendarId = e.target.value;
        };
    } catch (error) {
        console.error('Error loading calendars:', error);
        select.innerHTML = '<option value="primary">Primary Calendar</option>';
    }
}

async function loadCalendarEvents() {
    if (!folderId) return;
    
    try {
        const eventsFileId = await getOrCreateFile('calendar_events.json', folderId);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${eventsFileId}?alt=media`, {
            headers: { Authorization: 'Bearer ' + accessToken },
        });
        const data = await response.json();
        calendarEvents = data.events || [];
        renderCalendarEvents();
    } catch (e) {
        calendarEvents = [];
        renderCalendarEvents();
    }
}

async function importCalendarEvents() {
    const btn = document.getElementById('importEventsBtn');
    btn.disabled = true;
    btn.textContent = 'Importing...';
    
    try {
        const now = new Date();
        const timeMin = new Date(2000, 0, 1).toISOString();
        const timeMax = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59).toISOString();
        
        const calendarId = selectedCalendarId || 'primary';
        const allEvents = [];
        let pageToken = null;
        
        do {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=2500${pageToken ? '&pageToken=' + pageToken : ''}`;
            const response = await fetch(url, {
                headers: { Authorization: 'Bearer ' + accessToken }
            });
            
            if (!response.ok) throw new Error('Failed to fetch calendar events');
            
            const data = await response.json();
            
            if (data.items) {
                allEvents.push(...data.items);
            }
            
            pageToken = data.nextPageToken;
            btn.textContent = `Importing... (${allEvents.length} events)`;
        } while (pageToken);
        
        if (allEvents.length > 0) {
            const imported = allEvents.map(event => ({
                id: event.id,
                title: event.summary || 'Untitled Event',
                content: event.description || '',
                date: event.start.date || event.start.dateTime.split('T')[0],
                timestamp: event.start.dateTime || event.start.date + 'T00:00:00',
                location: event.location ? { name: event.location, address: event.location } : null,
                source: 'google_calendar'
            }));
            
            calendarEvents = imported;
            
            const eventsFileId = await getOrCreateFile('calendar_events.json', folderId);
            const blob = new Blob([JSON.stringify({ events: calendarEvents }, null, 2)], { type: 'application/json' });
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${eventsFileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 
                    Authorization: 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: blob,
            });
            
            currentEventsPage = 0;
            renderCalendarEvents();
            alert(`Imported ${imported.length} events from Google Calendar`);
        }
    } catch (error) {
        console.error('Error importing events:', error);
        alert('Failed to import events: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Import Events';
    }
}


function renderCalendarEvents() {
    const list = document.getElementById('calendarEventsList');
    if (!list) return;
    
    if (calendarEvents.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No calendar events imported yet. Tap Import to sync from Google Calendar.</p>';
        return;
    }
    
    list.innerHTML = '';
    const sortedEvents = [...calendarEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const start = currentEventsPage * EVENTS_PER_PAGE;
    const end = start + EVENTS_PER_PAGE;
    const pageEvents = sortedEvents.slice(start, end);
    
    pageEvents.forEach(event => {
        const card = document.createElement('div');
        card.className = 'entry-card';
        
        const date = new Date(event.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        card.innerHTML = `
            <div class="entry-date">${dateStr}</div>
            <div class="entry-title">${event.title}</div>
            ${event.location ? `<div style="color:#666;font-size:14px;margin:8px 0;">📍 ${event.location.name}</div>` : ''}
            <div class="entry-preview">${event.content}</div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0;color:#8e8e93;font-size:12px;">From Google Calendar</div>
        `;
        list.appendChild(card);
    });
}

async function loadGooglePhotos() {
    const btn = document.getElementById('loadPhotosBtn');
    const gallery = document.getElementById('photosGallery');
    
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    try {
        const response = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50', {
            headers: { Authorization: 'Bearer ' + accessToken }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            gallery.innerHTML = `<div style="padding:40px;text-align:center;"><p style="color:#ff3b30;">❌ Photos access not granted</p><p style="color:#666;font-size:14px;">Error: ${errorData.error?.message || 'Permission denied'}</p></div>`;
            return;
        }
        
        const data = await response.json();
        
        if (data.mediaItems && data.mediaItems.length > 0) {
            const photosByDate = {};
            data.mediaItems.forEach(item => {
                const date = item.mediaMetadata.creationTime.split('T')[0];
                if (!photosByDate[date]) photosByDate[date] = [];
                photosByDate[date].push(item);
            });
            
            gallery.innerHTML = '';
            Object.keys(photosByDate).sort().reverse().forEach(date => {
                const dateDiv = document.createElement('div');
                dateDiv.style.marginBottom = '20px';
                
                const dateHeader = document.createElement('h3');
                dateHeader.textContent = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                dateHeader.style.padding = '10px 20px';
                dateHeader.style.background = 'white';
                dateHeader.style.borderRadius = '8px';
                dateHeader.style.marginBottom = '10px';
                dateDiv.appendChild(dateHeader);
                
                const photosGrid = document.createElement('div');
                photosGrid.style.display = 'grid';
                photosGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
                photosGrid.style.gap = '8px';
                photosGrid.style.padding = '0 20px';
                
                photosByDate[date].forEach(photo => {
                    const img = document.createElement('img');
                    img.src = photo.baseUrl + '=w300-h300-c';
                    img.style.width = '100%';
                    img.style.aspectRatio = '1';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '8px';
                    img.style.cursor = 'pointer';
                    img.onclick = () => window.open(photo.productUrl, '_blank');
                    photosGrid.appendChild(img);
                });
                
                dateDiv.appendChild(photosGrid);
                gallery.appendChild(dateDiv);
            });
        } else {
            gallery.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No photos found in your Google Photos library.</p>';
        }
    } catch (error) {
        console.error('Error loading photos:', error);
        gallery.innerHTML = `<div style="padding:40px;text-align:center;"><p style="color:#ff3b30;">❌ Failed to load photos</p><p style="color:#666;font-size:14px;">${error.message}</p></div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Load Recent Photos';
    }
}

document.getElementById('importEventsBtn').onclick = async () => {
    await importCalendarEvents();
};

document.getElementById('loadPhotosBtn').onclick = async () => {
    await loadGooglePhotos();
};