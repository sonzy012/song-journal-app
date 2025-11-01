// Override renderCalendarEvents with pagination
const originalRenderCalendarEvents = renderCalendarEvents;
renderCalendarEvents = function() {
    const list = document.getElementById('calendarEventsList');
    if (!list) return;
    
    if (calendarEvents.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#8e8e93;padding:40px;">No calendar events imported yet. Tap Import to sync from Google Calendar.</p>';
        return;
    }
    
    list.innerHTML = '';
    const sortedEvents = [...calendarEvents].sort((a, b) => {
        return eventsSortOrder === 'desc' 
            ? new Date(b.timestamp) - new Date(a.timestamp)
            : new Date(a.timestamp) - new Date(b.timestamp);
    });
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
    
    const totalPages = Math.ceil(sortedEvents.length / EVENTS_PER_PAGE);
    if (totalPages > 1) {
        const pagination = document.createElement('div');
        pagination.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:10px;padding:20px;';
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Previous';
        prevBtn.className = 'btn-text';
        prevBtn.disabled = currentEventsPage === 0;
        prevBtn.onclick = () => { currentEventsPage--; renderCalendarEvents(); };
        pagination.appendChild(prevBtn);
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${currentEventsPage + 1} of ${totalPages}`;
        pageInfo.style.color = '#666';
        pagination.appendChild(pageInfo);
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.className = 'btn-text';
        nextBtn.disabled = currentEventsPage >= totalPages - 1;
        nextBtn.onclick = () => { currentEventsPage++; renderCalendarEvents(); };
        pagination.appendChild(nextBtn);
        list.appendChild(pagination);
    }
};
