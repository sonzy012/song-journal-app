// AI Chat with Google Gemini
let chatHistory = [];

document.getElementById('aiChatBtn').onclick = () => {
    document.getElementById('aiChatModal').classList.add('active');
    if (chatHistory.length === 0) {
        addChatMessage('ai', 'Hi! Ask me anything about your journal entries. For example:\n\n• "How much did I spend at Costco this month?"\n• "What did I eat last week?"\n• "Show me my gym visits"\n• "Summarize my November activities"');
    }
};

document.getElementById('closeChatBtn').onclick = () => {
    document.getElementById('aiChatModal').classList.remove('active');
};

document.getElementById('sendChatBtn').onclick = () => {
    sendChatMessage();
};

document.getElementById('chatInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
    }
};

function addChatMessage(role, text) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `margin-bottom:16px;display:flex;${role === 'user' ? 'justify-content:flex-end;' : ''}`;
    
    const bubble = document.createElement('div');
    bubble.style.cssText = `max-width:80%;padding:12px 16px;border-radius:16px;${
        role === 'user' 
            ? 'background:#007aff;color:white;' 
            : 'background:white;color:#333;border:1px solid #e5e5ea;'
    }`;
    bubble.textContent = text;
    bubble.style.whiteSpace = 'pre-wrap';
    
    messageDiv.appendChild(bubble);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    addChatMessage('user', question);
    input.value = '';
    
    const sendBtn = document.getElementById('sendChatBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Thinking...';
    
    try {
        const answer = await askGemini(question);
        addChatMessage('ai', answer);
    } catch (error) {
        console.error('AI Error:', error);
        addChatMessage('ai', 'Sorry, I encountered an error. Please try again.');
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
    }
}

async function askGemini(question) {
    if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        return 'Please add your Gemini API key to config.js\n\nGet it from: https://aistudio.google.com/app/apikey';
    }
    
    // Prepare context from journal entries with images
    const { context, images } = await prepareJournalContext(question);
    
    const prompt = `You are a helpful assistant analyzing a personal journal. Answer the user's question based on their journal entries and photos.

Journal Entries:
${context}

User Question: ${question}

Provide a clear, concise answer. If you need to calculate totals or analyze patterns, do so. If the information isn't in the journal, say so. When analyzing photos, describe what you see.`;

    // Build parts array with text and images
    const parts = [{ text: prompt }];
    images.forEach(img => {
        parts.push({
            inline_data: {
                mime_type: img.mimeType,
                data: img.base64
            }
        });
    });
    
    console.log('Sending to Gemini:', { textLength: prompt.length, imageCount: images.length });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${CONFIG.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts }]
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

async function prepareJournalContext(question) {
    const lowerQuestion = question.toLowerCase();
    
    // Filter relevant entries based on question keywords
    let relevantEntries = entriesCache;
    
    // Date filtering
    // Check for specific dates (e.g., "November 1st", "2025-11-01", "Nov 1")
    const dateMatch = question.match(/(\d{4}-\d{2}-\d{2})|([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i);
    if (dateMatch) {
        const dateStr = dateMatch[0];
        let targetDate;
        
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Format: 2025-11-01
            targetDate = dateStr;
        } else {
            // Format: "November 1st" or "Nov 1, 2025"
            const parsed = new Date(dateStr);
            if (!isNaN(parsed)) {
                targetDate = parsed.toISOString().split('T')[0];
            }
        }
        
        if (targetDate) {
            relevantEntries = relevantEntries.filter(e => e.date === targetDate);
        }
    } else if (lowerQuestion.includes('today')) {
        const today = new Date().toISOString().split('T')[0];
        relevantEntries = relevantEntries.filter(e => e.date === today);
    } else if (lowerQuestion.includes('last week')) {
        const today = new Date();
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(thisWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(thisWeekStart);
        lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
        relevantEntries = relevantEntries.filter(e => {
            const entryDate = new Date(e.date);
            return entryDate >= lastWeekStart && entryDate <= lastWeekEnd;
        });
    } else if (lowerQuestion.includes('this week')) {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
        relevantEntries = relevantEntries.filter(e => new Date(e.date) >= weekStart);
    } else if (lowerQuestion.includes('this month')) {
        const today = new Date();
        relevantEntries = relevantEntries.filter(e => {
            const entryDate = new Date(e.date);
            return entryDate.getMonth() === today.getMonth() && entryDate.getFullYear() === today.getFullYear();
        });
    } else if (lowerQuestion.includes('last month')) {
        const today = new Date();
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        relevantEntries = relevantEntries.filter(e => {
            const entryDate = new Date(e.date);
            return entryDate.getMonth() === lastMonth.getMonth() && entryDate.getFullYear() === lastMonth.getFullYear();
        });
    }
    
    // Location filtering (only if no date filter matched)
    if (relevantEntries.length === entriesCache.length) {
        const locationKeywords = ['costco', 'foodland', 'gym', 'restaurant', 'cafe'];
        const matchedKeyword = locationKeywords.find(kw => lowerQuestion.includes(kw));
        if (matchedKeyword) {
            relevantEntries = relevantEntries.filter(e => 
                e.location && e.location.name.toLowerCase().includes(matchedKeyword)
            );
        }
    }
    
    // Tag filtering for food/eat (only if no date/location filter matched)
    if (relevantEntries.length === entriesCache.length && (lowerQuestion.includes('food') || lowerQuestion.includes('eat') || lowerQuestion.includes('ate') || lowerQuestion.includes('cook'))) {
        relevantEntries = relevantEntries.filter(e => 
            (e.tags && e.tags.some(t => ['food', 'restaurant', 'cafe', 'cook'].includes(t))) ||
            (e.location && e.location.name && (e.location.name.toLowerCase().includes('restaurant') || e.location.name.toLowerCase().includes('cafe')))
        );
    }
    
    // Limit to most recent 20 entries to avoid token limits
    relevantEntries = relevantEntries.slice(0, 20);
    
    // Fetch images for entries with photos
    const images = [];
    console.log('Relevant entries with media:', relevantEntries.filter(e => e.media && e.media.length > 0));
    
    for (const entry of relevantEntries) {
        if (entry.media && entry.media.length > 0) {
            console.log(`Entry ${entry.date} has ${entry.media.length} media items:`, entry.media);
            // Limit to first 3 images per entry to avoid token limits
            const imageItems = entry.media.filter(m => m.type === 'image' && m.id).slice(0, 3);
            for (const mediaItem of imageItems) {
                try {
                    console.log('Fetching image:', mediaItem.id);
                    const imageData = await fetchImageFromDrive(mediaItem.id);
                    if (imageData) {
                        console.log('Image fetched successfully, size:', imageData.base64.length);
                        images.push(imageData);
                        console.log('Images array now has:', images.length, 'items');
                    } else {
                        console.warn('Image fetch returned null for:', mediaItem.id);
                    }
                } catch (e) {
                    console.error('Failed to fetch image:', mediaItem.id, e);
                }
            }
        }
    }
    
    console.log(`Total images to send to Gemini: ${images.length}`);
    
    // Format entries for AI
    const context = relevantEntries.map(entry => {
        let text = `Date: ${entry.date}\n`;
        text += `Title: ${entry.title}\n`;
        if (entry.content) text += `Content: ${entry.content}\n`;
        if (entry.location) text += `Location: ${entry.location.name}\n`;
        if (entry.tags && entry.tags.length > 0) text += `Tags: ${entry.tags.join(', ')}\n`;
        if (entry.media && entry.media.length > 0) {
            const imageCount = entry.media.filter(m => m.type === 'image').length;
            if (imageCount > 0) text += `Photos: ${imageCount} image(s) attached\n`;
        }
        return text;
    }).join('\n---\n');
    
    return { context, images };
}

async function fetchImageFromDrive(fileId) {
    try {
        if (!accessToken) {
            console.error('No access token available');
            return null;
        }
        
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: 'Bearer ' + accessToken }
        });
        
        if (!response.ok) {
            console.error('Drive API error:', response.status, response.statusText);
            return null;
        }
        
        const blob = await response.blob();
        const base64 = await blobToBase64(blob);
        
        return {
            mimeType: blob.type,
            base64: base64.split(',')[1] // Remove data:image/jpeg;base64, prefix
        };
    } catch (e) {
        console.error('Error fetching image:', e);
        return null;
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
