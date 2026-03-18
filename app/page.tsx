'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import heLocale from '@fullcalendar/core/locales/he'
import { EventClickArg, EventDropArg } from '@fullcalendar/core'

const getLocalISOString = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`
}

const openWhatsApp = (phone: string, message: string) => {
  let cleanPhone = phone.replace(/\D/g, ''); 
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '972' + cleanPhone.slice(1); 
  }
  const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

interface Appointment {
  id: string | number
  title: string
  start: string
  end: string
  color: string
  extendedProps: {
    phone: string
    service: string
    email?: string
  }
}

export default function BarberProDashboard() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const calendarRef = useRef<FullCalendar>(null)
  
  const [currentView, setCurrentView] = useState('dayGridMonth') 
  const [currentDateTitle, setCurrentDateTitle] = useState('')
  const [currentActiveDate, setCurrentActiveDate] = useState<Date | null>(null)
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [editingHistoryEvent, setEditingHistoryEvent] = useState<Appointment | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')

  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false)
  const [newEventData, setNewEventData] = useState({
    name: '', phone: '', email: '', date: '', time: '', service: 'תספורת גברית'
  })

  const [isEventActionModalOpen, setIsEventActionModalOpen] = useState(false)
  
  // סטייטים לתפריטים ולמערכת ה-SaaS (פרופיל, עיצוב, סטטיסטיקות)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false)
  const [statsTab, setStatsTab] = useState<'menu' | 'monthly' | 'revenue' | 'loyal'>('menu')
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [userProfile, setUserProfile] = useState({ name: 'Barber', avatarUrl: '' })
  
  const [isDesignModalOpen, setIsDesignModalOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  // סטייטים לפעולות המרוכזות
  const [bulkModalDate, setBulkModalDate] = useState<Date | null>(null)
  const [bulkActionView, setBulkActionView] = useState<'menu' | 'reminders' | 'cancels'>('menu')
  const [bulkQueueIndex, setBulkQueueIndex] = useState(0)

  const clickTimeout = useRef<NodeJS.Timeout | null>(null)
  const eventClickTimeout = useRef<NodeJS.Timeout | null>(null)

  // טעינת עיצוב שומר מסך
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') setIsDarkMode(true);
  }, [])

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsLoading(false)
      if (session) {
        fetchAppointments(session.user.id)
        const meta = session.user.user_metadata;
        if (meta) {
          setUserProfile({ 
            name: meta.display_name || 'BarberBooks', 
            avatarUrl: meta.avatar_url || '' 
          })
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    const barberId = session.user.id
    const subscription = supabase
      .channel('appointments_realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'appointments', filter: `barber_id=eq.${barberId}` }, 
        () => fetchAppointments(barberId)
      )
      .subscribe()
    return () => { supabase.removeChannel(subscription) }
  }, [session])

  const fetchAppointments = async (barberId: string) => {
    const { data } = await supabase.from('appointments').select('*').eq('barber_id', barberId)
    if (data) {
      setAppointments(data.map(app => {
        let startStr = app.start_time.split('+')[0].split('Z')[0].replace(' ', 'T')
        if (startStr.split(':').length === 2) startStr += ':00' 
        const startDate = new Date(startStr)
        const endDate = new Date(startDate.getTime() + 30 * 60000)
        return {
          id: app.id, title: app.client_name, start: startStr, end: getLocalISOString(endDate), color: '#3b82f6', 
          extendedProps: { phone: app.phone, service: app.service, email: app.email }
        }
      }))
    }
  }

  // --- שמירת פרופיל ---
  const handleSaveProfile = async () => {
    const { error } = await supabase.auth.updateUser({
      data: { display_name: userProfile.name, avatar_url: userProfile.avatarUrl }
    })
    if (!error) {
      setIsProfileModalOpen(false);
    } else {
      alert('אירעה שגיאה בשמירת הפרופיל');
    }
  }

  // --- חישובי סטטיסטיקות דינמיים ---
  const now = new Date();
  const currentMonthApps = appointments.filter(a => new Date(a.start).getMonth() === now.getMonth() && new Date(a.start).getFullYear() === now.getFullYear());
  const lastMonthApps = appointments.filter(a => {
      const d = new Date(a.start);
      let lm = now.getMonth() - 1;
      let y = now.getFullYear();
      if(lm < 0) { lm = 11; y--; }
      return d.getMonth() === lm && d.getFullYear() === y;
  });
  
  const totalRevenue = currentMonthApps.length * 70; 
  const clientCounts: Record<string, number> = {};
  appointments.forEach(a => {
      if(a.title) clientCounts[a.title] = (clientCounts[a.title] || 0) + 1;
  });
  const topClients = Object.entries(clientCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);


  // --- נתוני פעולות מרוכזות ---
  const bulkAppointments = bulkModalDate 
    ? appointments.filter(a => {
        const d = new Date(a.start);
        return d.getDate() === bulkModalDate.getDate() && 
               d.getMonth() === bulkModalDate.getMonth() && 
               d.getFullYear() === bulkModalDate.getFullYear();
      }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    : [];

  const handleNextBulkWA = () => {
    if(bulkQueueIndex < bulkAppointments.length) {
      const app = bulkAppointments[bulkQueueIndex];
      const dateStr = new Date(app.start).toLocaleDateString('he-IL');
      const timeStr = new Date(app.start).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
      
      if(bulkActionView === 'reminders') {
         const msg = `היי ${app.title}, תזכורת מרוכזת לתור שלך למספרה ביום ${dateStr} בשעה ${timeStr}. נשמח לראותך! ✂️`;
         if(app.extendedProps.phone) openWhatsApp(app.extendedProps.phone, msg);
      } else if (bulkActionView === 'cancels') {
         const msg = `היי ${app.title}, לצערנו נאלצנו לבטל את התור שלך למספרה במועד ${dateStr} בשעה ${timeStr}. עמך הסליחה.`;
         if(app.extendedProps.phone) openWhatsApp(app.extendedProps.phone, msg);
      }
      setBulkQueueIndex(bulkQueueIndex + 1);
    }
  }

  const handleConfirmBulkCancel = async () => {
    if(!window.confirm(`האם אתה בטוח שברצונך לבטל ולמחוק ${bulkAppointments.length} תורים? פעולה זו אינה הפיכה!`)) return;
    const idsToDelete = bulkAppointments.map(a => String(a.id));
    setAppointments(prev => prev.filter(a => !idsToDelete.includes(String(a.id))));
    for(const id of idsToDelete) {
      await supabase.from('appointments').delete().eq('id', id);
    }
    setBulkActionView('cancels');
    setBulkQueueIndex(0);
  }

  const selectedClientHistory = appointments
    .filter(app => app.title === selectedClientName)
    .filter(app => {
      const twoWeeksAgo = new Date()
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
      return new Date(app.start).getTime() >= twoWeeksAgo.getTime()
    })
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    else {
      setSession(data.session)
      if (data.session) fetchAppointments(data.session.user.id)
    }
  }

  const changeView = (viewName: string) => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      calendarApi.changeView(viewName)
      setCurrentView(viewName)
    }
  }

  const navigateCalendar = (action: 'prev' | 'next' | 'today') => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      if (action === 'prev') calendarApi.prev()
      if (action === 'next') calendarApi.next()
      if (action === 'today') calendarApi.today()
    }
  }

  const goToDateView = (dateStr: string) => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      calendarApi.gotoDate(dateStr)
      calendarApi.changeView('timeGridDay')
      setCurrentView('timeGridDay')
    }
  }

  const openNewEventModalWithDate = (date: Date, isMonthView: boolean) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    setNewEventData({
      name: '', phone: '', email: '', date: `${yyyy}-${mm}-${dd}`, time: isMonthView ? '09:00' : `${hh}:${min}`, service: 'תספורת גברית'
    })
    setIsNewEventModalOpen(true)
  }

  const handleOpenNewEventFromSidebar = () => {
    const now = new Date()
    openNewEventModalWithDate(now, true)
  }

  const handleDateClick = (arg: DateClickArg) => {
    if (currentView === 'dayGridMonth') {
      if (clickTimeout.current) {
        clearTimeout(clickTimeout.current);
        clickTimeout.current = null;
        goToDateView(arg.dateStr);
      } else {
        clickTimeout.current = setTimeout(() => {
          clickTimeout.current = null;
          openNewEventModalWithDate(arg.date, true);
        }, 300);
      }
    } else {
      openNewEventModalWithDate(arg.date, false);
    }
  }

  const handleEventClick = (info: EventClickArg) => {
    if (eventClickTimeout.current) {
      clearTimeout(eventClickTimeout.current);
      eventClickTimeout.current = null;
      setSelectedEvent(info.event);
      setIsEventActionModalOpen(true);
    } else {
      eventClickTimeout.current = setTimeout(() => {
        eventClickTimeout.current = null;
      }, 300);
    }
  }

  const handleSendReminder = () => {
    if (!selectedEvent) return;
    const phone = selectedEvent.extendedProps?.phone;
    if (!phone) { alert('לא הוזן מספר טלפון ללקוח זה.'); return; }
    const d = selectedEvent.start;
    const dateStr = d.toLocaleDateString('he-IL');
    const timeStr = d.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
    
    const msg = `היי ${selectedEvent.title}, תזכורת לתור שלך למספרה ביום ${dateStr} בשעה ${timeStr}. נשמח לראותך! ✂️`;
    openWhatsApp(phone, msg);
    setIsEventActionModalOpen(false);
  }

  const handleOpenEditFromAction = () => {
    if (!selectedEvent) return;
    const originalApp = appointments.find(a => String(a.id) === String(selectedEvent.id));
    if (!originalApp) return;
    handleHistoryItemDoubleClick(originalApp); 
    setIsEventActionModalOpen(false);
  }

  const handleCancelFromAction = async () => {
    if (!selectedEvent) return;
    if (!window.confirm('האם אתה בטוח שברצונך לבטל תור זה?')) return;

    const originalApp = appointments.find(a => String(a.id) === String(selectedEvent.id));
    if (!originalApp) return;

    setAppointments(prev => prev.filter(a => String(a.id) !== String(originalApp.id)));
    const { error } = await supabase.from('appointments').delete().eq('id', originalApp.id);
    
    if (!error) {
      if (originalApp.extendedProps.phone) {
        const startDate = new Date(originalApp.start);
        const dateStr = startDate.toLocaleDateString('he-IL');
        const timeStr = startDate.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
        const msg = `היי ${originalApp.title}, לצערנו התור שלך למספרה במועד ${dateStr} בשעה ${timeStr} בוטל.`;
        openWhatsApp(originalApp.extendedProps.phone, msg);
      }
      setIsEventActionModalOpen(false);
    } else {
      alert('שגיאה בביטול התור');
      if (session) fetchAppointments(session.user.id);
    }
  }

  const handleEventDrop = async (dropInfo: EventDropArg) => {
    if (!session) return
    const fcEventId = dropInfo.event.id
    const originalApp = appointments.find(a => String(a.id) === String(fcEventId))
    if (!originalApp) { dropInfo.revert(); return; }

    const d = dropInfo.event.start;
    if (!d) return;

    const clientName = originalApp.title;
    const formattedDate = d.toLocaleDateString('he-IL');
    const formattedTime = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    if (!window.confirm(`האם אתה בטוח שברצונך לשנות את התור של ${clientName} לתאריך ${formattedDate} בשעה ${formattedTime}?`)) {
      dropInfo.revert(); return;
    }

    const newStartString = getLocalISOString(d)
    const isConflict = appointments.some(app => app.id !== originalApp.id && app.start === newStartString)

    if (isConflict) { alert('⚠️ כבר קיים תור במועד זה! הפעולה בוטלה.'); dropInfo.revert(); return; }

    const newEndString = getLocalISOString(new Date(d.getTime() + 30 * 60000))
    setAppointments(prev => prev.map(a => a.id === originalApp.id ? { ...a, start: newStartString, end: newEndString } : a))

    const { error } = await supabase.from('appointments').update({ start_time: newStartString }).eq('id', originalApp.id)
    
    if (error) {
      alert('אירעה שגיאה בשמירת התור במסד הנתונים.'); dropInfo.revert(); fetchAppointments(session.user.id); return;
    }

    const clientEmail = originalApp.extendedProps.email;
    if (clientEmail) {
      const formatGoogleDate = (dateObj: Date) => dateObj.toISOString().replace(/-|:|\.\d\d\d/g, '')
      const shortCalTitle = encodeURIComponent(`תור למספרה`)
      const googleCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${shortCalTitle}&dates=${formatGoogleDate(d)}/${formatGoogleDate(new Date(d.getTime() + 30 * 60000))}`

      try {
        await fetch('/api/send-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: clientName, email: clientEmail, date: formattedDate, time: formattedTime, service: originalApp.extendedProps.service || 'תספורת', calendarLink: googleCalLink })
        });
      } catch (err) { console.error("שגיאה בשליחת המייל:", err); }
    }
  }

  const handleClientSelect = (clientName: string) => {
    setSearchQuery('')
    setShowSearchResults(false)
    setSelectedClientName(clientName)
    setIsHistoryModalOpen(true)
  }

  const handleHistoryItemDoubleClick = (app: Appointment) => {
    setEditingHistoryEvent(app)
    const startDate = new Date(app.start)
    const yyyy = startDate.getFullYear()
    const mm = String(startDate.getMonth() + 1).padStart(2, '0')
    const dd = String(startDate.getDate()).padStart(2, '0')
    setEditDate(`${yyyy}-${mm}-${dd}`)
    setEditTime(startDate.toTimeString().slice(0, 5))
  }

  const handleUpdateHistoryAppointment = async () => {
    if (!editingHistoryEvent) return
    const originalApp = appointments.find(a => String(a.id) === String(editingHistoryEvent.id));
    if (!originalApp) return;
    
    const newStartString = `${editDate}T${editTime}:00`
    const isConflict = appointments.some(app => String(app.id) !== String(originalApp.id) && app.start === newStartString)

    if (isConflict) { alert('⚠️ כבר קיים תור במועד זה! אנא בחר תאריך או שעה אחרים.'); return; }

    const newStartDate = new Date(newStartString)
    const newEndString = getLocalISOString(new Date(newStartDate.getTime() + 30 * 60000))
    
    setAppointments(prev => prev.map(a => String(a.id) === String(originalApp.id) ? { ...a, start: newStartString, end: newEndString } : a))

    const { error } = await supabase.from('appointments').update({ start_time: newStartString }).eq('id', originalApp.id)

    if (!error) {
      const clientEmail = originalApp.extendedProps.email;
      if (clientEmail) {
        const formatGoogleDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '')
        const shortCalTitle = encodeURIComponent(`תור למספרה`)
        const googleCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${shortCalTitle}&dates=${formatGoogleDate(newStartDate)}/${formatGoogleDate(new Date(newStartDate.getTime() + 30 * 60000))}`
        try {
          await fetch('/api/send-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: originalApp.title, email: clientEmail, date: newStartDate.toLocaleDateString('he-IL'), time: newStartDate.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}), service: originalApp.extendedProps.service || 'תספורת', calendarLink: googleCalLink })
          });
        } catch (err) { console.error("שגיאה בשליחת המייל:", err); }
      }
      setEditingHistoryEvent(null)
    } else {
      alert('אירעה שגיאה בעדכון התור.')
      if (session) fetchAppointments(session.user.id) 
    }
  }

  const handleDeleteHistoryAppointment = async () => {
    if (!editingHistoryEvent) return
    if (!window.confirm('האם אתה בטוח שברצונך לבטל תור זה?')) return

    const originalApp = appointments.find(a => String(a.id) === String(editingHistoryEvent.id));
    if (!originalApp) return;

    const startDate = new Date(originalApp.start)
    setAppointments(prev => prev.filter(a => String(a.id) !== String(originalApp.id)))
    const { error } = await supabase.from('appointments').delete().eq('id', originalApp.id)
    
    if (!error) {
      const dateStr = startDate.toLocaleDateString('he-IL');
      const timeStr = startDate.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
      const msg = `היי ${originalApp.title}, לצערנו התור שלך למספרה במועד ${dateStr} בשעה ${timeStr} בוטל.`;
      
      if (originalApp.extendedProps.phone) openWhatsApp(originalApp.extendedProps.phone, msg);
      
      setEditingHistoryEvent(null)
      if (selectedClientHistory.length <= 1) { setIsHistoryModalOpen(false); setSelectedClientName(null); }
    } else {
      if (session) fetchAppointments(session.user.id) 
    }
  }

  const handleCreateNewEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.user?.id) return

    const newStartString = `${newEventData.date}T${newEventData.time}:00`
    const isConflict = appointments.some(app => app.start === newStartString)
    if (isConflict) { alert('⚠️ כבר קיים תור במועד זה! אנא בחר תאריך או שעה אחרים.'); return; }

    const newStartDate = new Date(newStartString)
    const tempId = 'temp-' + Date.now()
    const newEndString = getLocalISOString(new Date(newStartDate.getTime() + 30 * 60000))

    const newApp: Appointment = {
      id: tempId, title: newEventData.name, start: newStartString, end: newEndString, color: '#3b82f6', 
      extendedProps: { phone: newEventData.phone, service: newEventData.service, email: newEventData.email }
    }
    setAppointments(prev => [...prev, newApp])

    const { data, error } = await supabase.from('appointments').insert([
      { barber_id: session.user.id, client_name: newEventData.name, phone: newEventData.phone, email: newEventData.email, service: newEventData.service, start_time: newStartString }
    ]).select()

    if (error) {
      alert('אירעה שגיאה ביצירת התור.')
      setAppointments(prev => prev.filter(a => a.id !== tempId)) 
      return
    }

    const formatGoogleDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '')
    const shortCalTitle = encodeURIComponent(`תור למספרה`)
    const googleCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${shortCalTitle}&dates=${formatGoogleDate(newStartDate)}/${formatGoogleDate(new Date(newStartDate.getTime() + 30 * 60000))}`

    if (newEventData.email) {
      try {
        await fetch('/api/send-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newEventData.name, email: newEventData.email, date: newStartDate.toLocaleDateString('he-IL'), time: newStartDate.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}), service: newEventData.service, calendarLink: googleCalLink })
        });
      } catch (err) { console.error("שגיאה בשליחת המייל:", err); }
    }

    setNewEventData({ name: '', phone: '', email: '', date: '', time: '', service: 'תספורת גברית' })
    setIsNewEventModalOpen(false)
  }

  const renderDayHeader = (args: any) => {
    const dayName = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(args.date);
    const dateStr = args.date.toLocaleDateString('he-IL', {day: '2-digit', month: '2-digit'});
    
    if (currentView === 'dayGridMonth') {
      return <div className="font-semibold text-[14px] pb-2 pt-1">{dayName}</div>
    }
    
    return (
      <div className="flex items-center justify-between w-full px-2 pb-2 pt-1">
        <div className="font-semibold text-[14px] flex flex-col items-start leading-tight">
          <span>{dayName}</span>
          <span className={`text-[11px] font-normal ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{dateStr}</span>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setBulkModalDate(args.date);
            setBulkActionView('menu');
            setBulkQueueIndex(0);
          }} 
          className="text-indigo-400 hover:text-indigo-500 transition-transform hover:scale-110 p-1" 
          title="פעולות מרוכזות ליום זה"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"/>
          </svg>
        </button>
      </div>
    )
  }

  const renderEventContent = (eventInfo: any) => {
    if (eventInfo.view.type === 'dayGridMonth') {
      return (
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] w-full overflow-hidden my-[1px] transition-colors cursor-pointer ${isDarkMode ? 'bg-blue-900/40 border-blue-800 text-blue-300 hover:bg-blue-900/60' : 'bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100'}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0"></div>
          <span className="truncate font-medium">{eventInfo.timeText} לקוח: {eventInfo.event.title}</span>
        </div>
      )
    }
    
    return (
      <div className="w-full h-full bg-[#3b82f6] text-white rounded-[4px] px-3 py-1 flex flex-col hover:opacity-90 transition-opacity cursor-pointer shadow-sm border border-blue-600/20" dir="rtl">
        <div className="text-[13px] font-bold leading-tight flex items-center justify-start gap-1 mb-0.5">
          <span className="truncate">{eventInfo.event.title}</span>
          {eventInfo.event.extendedProps?.phone && (
            <span className="text-blue-100 font-normal text-[12px] whitespace-nowrap">- {eventInfo.event.extendedProps.phone}</span>
          )}
        </div>
        {eventInfo.event.extendedProps?.service && (
          <div className="text-[11px] text-blue-100 opacity-90 truncate">{eventInfo.event.extendedProps.service}</div>
        )}
      </div>
    )
  }

  const today = new Date();
  const miniYear = miniCalendarDate.getFullYear();
  const miniMonth = miniCalendarDate.getMonth();
  const daysInMiniMonth = new Date(miniYear, miniMonth + 1, 0).getDate();
  const firstDayOfMiniMonth = new Date(miniYear, miniMonth, 1).getDay();
  const hebrewMonths = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const miniCalendarTitle = `${hebrewMonths[miniMonth]} ${miniYear}`;

  if (isLoading) return <div className={`min-h-screen flex items-center justify-center font-medium ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-white text-slate-900'}`}>טוען מערכת...</div>

  if (!session) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 font-sans ${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-50'}`} dir="rtl">
        <form onSubmit={handleLogin} className={`w-full max-w-md rounded-3xl p-10 border shadow-2xl transition-all ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-white border-slate-100'}`}>
          <div className="flex flex-col items-center justify-center mb-10">
             <img src="/logo.png" alt="BarberBooks" className="h-16 w-auto object-contain" />
             <div className="mt-4 text-slate-400 text-sm font-medium">ניהול חכם למספרה שלך</div>
          </div>
          <div className="space-y-6">
            <input type="email" required placeholder="אימייל" className={`w-full rounded-2xl p-4 outline-none transition-all border ${isDarkMode ? 'bg-[#0f172a] border-slate-700 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 focus:border-[#3b82f6]'}`} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" required placeholder="סיסמה" className={`w-full rounded-2xl p-4 outline-none transition-all border ${isDarkMode ? 'bg-[#0f172a] border-slate-700 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 focus:border-[#3b82f6]'}`} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit" className="w-full bg-[#3b82f6] text-white font-bold py-4.5 rounded-2xl shadow-lg mt-2 hover:bg-blue-600 transition-colors">כניסה למערכת</button>
          </div>
        </form>
      </div>
    )
  }

  // --- צבעים דינמיים לפי ה-Dark Mode ---
  const bgMain = isDarkMode ? 'bg-[#0f172a] text-slate-200 dark-theme' : 'bg-white text-slate-900';
  const bgPanel = isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-white border-slate-200';
  const bgInput = isDarkMode ? 'bg-[#0f172a] border-slate-700 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 focus:border-blue-500';
  const textTitle = isDarkMode ? 'text-white' : 'text-slate-800';
  const textMuted = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`flex h-screen overflow-hidden font-sans ${bgMain}`} dir="rtl">
      
      {/* סיידבר */}
      <aside className={`w-[300px] flex flex-col shrink-0 z-20 shadow-sm border-l ${bgPanel}`}>
        <div className={`h-[80px] flex items-center justify-center px-6 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
           <img src="/logo.png" alt="BarberBooks" className="max-h-[56px] max-w-full object-contain" />
        </div>

        <div className="px-6 py-6 flex flex-col gap-6 flex-1 overflow-y-auto">
          <button 
            onClick={handleOpenNewEventFromSidebar}
            className={`flex items-center justify-center w-full py-3 rounded-xl transition-all font-semibold gap-2 shadow-sm border ${isDarkMode ? 'bg-[#0f172a] hover:bg-slate-800 border-slate-700 text-white' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'}`}
          >
            <span>אירוע חדש</span>
            <span className="text-lg leading-none">+</span>
          </button>

          {/* מיני קלנדר */}
          <div className="bg-transparent mt-2">
            <div className="flex justify-between items-center mb-4">
              <span className={`font-bold text-sm ${textTitle}`}>{miniCalendarTitle}</span>
              <div className="flex gap-1 text-slate-400">
                <button onClick={() => setMiniCalendarDate(new Date(miniYear, miniMonth - 1, 1))} className={`p-1 rounded ${isDarkMode ? 'hover:text-white hover:bg-slate-800' : 'hover:text-slate-800 hover:bg-slate-50'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <button onClick={() => setMiniCalendarDate(new Date(miniYear, miniMonth + 1, 1))} className={`p-1 rounded ${isDarkMode ? 'hover:text-white hover:bg-slate-800' : 'hover:text-slate-800 hover:bg-slate-50'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[12px] text-slate-400 mb-3 font-semibold">
              <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
            </div>
            <div className={`grid grid-cols-7 gap-y-2 text-center text-[13px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {Array.from({ length: firstDayOfMiniMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="h-8 w-8"></div>
              ))}
              {Array.from({ length: daysInMiniMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${miniYear}-${String(miniMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isToday = dayNum === today.getDate() && miniMonth === today.getMonth() && miniYear === today.getFullYear();
                const isViewedDay = currentView === 'timeGridDay' && currentActiveDate && currentActiveDate.getDate() === dayNum && currentActiveDate.getMonth() === miniMonth && currentActiveDate.getFullYear() === miniYear && !isToday;
                
                const dayClass = isToday 
                  ? 'bg-[#3b82f6] text-white font-bold shadow-md' 
                  : isViewedDay 
                    ? (isDarkMode ? 'bg-slate-700 text-white font-bold shadow-sm' : 'bg-slate-200 text-slate-800 font-bold shadow-sm')
                    : (isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100');

                return (
                  <div key={dayNum} onClick={() => goToDateView(dateStr)} className={`h-8 w-8 flex items-center justify-center rounded-full transition-all cursor-pointer ${dayClass}`}>
                    {dayNum}
                  </div>
                )
              })}
            </div>
          </div>

          {/* מערכת החיפוש */}
          <div className="relative z-50">
            <div className="absolute right-3 top-3 text-slate-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <input 
              type="text" 
              placeholder="חיפוש אנשים" 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearchResults(true); }}
              className={`w-full rounded-xl py-3 pr-10 outline-none transition-all text-sm border ${bgInput}`} 
            />
            {showSearchResults && searchQuery && (
              <div className={`absolute top-full left-0 right-0 mt-2 rounded-lg shadow-xl max-h-48 overflow-y-auto border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                {Array.from(new Set(appointments.map(a => a.title)))
                  .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery.length > 0).length > 0 ? (
                  Array.from(new Set(appointments.map(a => a.title)))
                    .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery.length > 0).map((clientName, idx) => (
                    <div key={idx} onClick={() => handleClientSelect(clientName)} className={`px-4 py-3 cursor-pointer text-sm font-medium border-b last:border-0 ${isDarkMode ? 'hover:bg-slate-700 text-slate-200 border-slate-700' : 'hover:bg-slate-50 text-slate-700 border-slate-50'}`}>
                      {clientName}
                    </div>
                  ))
                ) : (
                  <div className={`px-4 py-3 text-sm ${textMuted}`}>לא נמצאו לקוחות</div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* אזור מרכזי */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className={`h-[80px] flex items-center justify-between px-8 border-b ${bgPanel}`}>
          <div className="flex items-center gap-6">
            <span className={`text-[24px] font-bold tracking-tight ${textTitle}`}>{currentDateTitle}</span>
            <div className={`flex items-center rounded-lg shadow-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <button onClick={() => navigateCalendar('prev')} className={`p-2 rounded-r-lg border-l transition-colors ${isDarkMode ? 'hover:bg-slate-700 border-slate-700 text-slate-400' : 'hover:bg-slate-50 border-slate-200 text-slate-500'}`}>
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              <button onClick={() => navigateCalendar('next')} className={`p-2 rounded-l-lg transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-50 text-slate-500'}`}>
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* בורר תצוגה */}
            <div className="relative group">
              <button className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {currentView === 'timeGridDay' ? 'יום' : currentView === 'timeGridWeek' ? 'שבוע' : 'חודש'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={textMuted}><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div className={`absolute top-full left-0 mt-1 w-full rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <button onClick={() => changeView('dayGridMonth')} className={`block w-full text-right px-4 py-2.5 text-sm font-medium ${isDarkMode ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}>חודש</button>
                <button onClick={() => changeView('timeGridWeek')} className={`block w-full text-right px-4 py-2.5 text-sm font-medium border-y ${isDarkMode ? 'hover:bg-slate-700 text-slate-200 border-slate-700' : 'hover:bg-slate-50 text-slate-700 border-slate-100'}`}>שבוע</button>
                <button onClick={() => changeView('timeGridDay')} className={`block w-full text-right px-4 py-2.5 text-sm font-medium ${isDarkMode ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}>יום</button>
              </div>
            </div>
            
            {/* תפריט הפרופיל והאייקון */}
            <div className="relative">
              <div onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="w-11 h-11 rounded-full cursor-pointer shadow-md border-2 border-white ring-1 ring-slate-200 flex items-center justify-center font-bold text-lg hover:opacity-90 transition-all overflow-hidden bg-gradient-to-tr from-[#f43f5e] to-[#f97316] text-white">
                {userProfile.avatarUrl ? (
                  <img src={userProfile.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'B'
                )}
              </div>
              
              {isProfileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setIsProfileMenuOpen(false)}></div>
                  <div className={`absolute top-full left-0 mt-3 w-56 rounded-2xl shadow-xl z-[110] overflow-hidden text-right py-2 border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                    <div className={`px-5 py-3 border-b mb-1 ${isDarkMode ? 'border-slate-700' : 'border-slate-50'}`}>
                       <div className={`font-bold ${textTitle}`}>{userProfile.name}</div>
                       <div className={`text-xs ${textMuted}`}>מנהל מערכת</div>
                    </div>
                    <button onClick={() => { setIsProfileMenuOpen(false); setIsProfileModalOpen(true); }} className={`w-full text-right px-5 py-3 font-medium flex items-center justify-end gap-3 transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}>
                      פרופיל אישי <span className="text-xl">👤</span>
                    </button>
                    <button onClick={() => { setIsProfileMenuOpen(false); setIsStatsModalOpen(true); setStatsTab('menu'); }} className={`w-full text-right px-5 py-3 font-medium flex items-center justify-end gap-3 transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}>
                      סטטיסטיקות והכנסות <span className="text-xl">📊</span>
                    </button>
                    <button onClick={() => { setIsProfileMenuOpen(false); setIsDesignModalOpen(true); }} className={`w-full text-right px-5 py-3 font-medium border-b flex items-center justify-end gap-3 transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-200 border-slate-700' : 'hover:bg-slate-50 text-slate-700 border-slate-50'}`}>
                      הגדרות עיצוב <span className="text-xl">🎨</span>
                    </button>
                    <button onClick={() => supabase.auth.signOut().then(() => setSession(null))} className={`w-full text-right px-5 py-3 font-medium flex items-center justify-end gap-3 transition-colors ${isDarkMode ? 'hover:bg-red-900/40 text-red-400' : 'hover:bg-red-50 text-red-500'}`}>
                      התנתקות <span className="text-xl">🚪</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 pt-6 overflow-hidden calendar-container relative">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth" 
            headerToolbar={false}
            locale={heLocale}
            direction="rtl"
            firstDay={0}
            slotMinTime="08:00:00"
            slotMaxTime="23:00:00"
            slotDuration="00:30:00"
            slotLabelInterval="00:30"
            eventStartEditable={currentView !== 'dayGridMonth'} 
            eventDrop={handleEventDrop}
            dateClick={handleDateClick}
            datesSet={(arg) => {
              setCurrentDateTitle(arg.view.title)
              setCurrentActiveDate(arg.view.calendar.getDate())
            }}
            eventClick={handleEventClick} 
            selectable={true}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderContent={renderDayHeader}
            events={appointments}
            allDaySlot={false}
            height="100%"
            nowIndicator={true}
            fixedWeekCount={false} 
            dayMaxEvents={2}
            eventContent={renderEventContent}
          />
        </div>
      </main>

      {/* ----------------- מודלים ופופאפים ----------------- */}

      {/* מודל פרופיל אישי */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[150] p-4">
          <div className={`rounded-3xl w-[400px] shadow-2xl relative p-8 border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <button onClick={() => setIsProfileModalOpen(false)} className={`absolute top-4 left-4 transition-colors p-1 ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto rounded-full shadow-lg border-4 border-white mb-3 overflow-hidden bg-gradient-to-tr from-[#f43f5e] to-[#f97316] text-white flex items-center justify-center text-3xl font-bold">
                {userProfile.avatarUrl ? <img src={userProfile.avatarUrl} className="w-full h-full object-cover" /> : (userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'B')}
              </div>
              <h3 className="text-2xl font-bold">פרופיל אישי</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 opacity-80">שם העסק / שם אישי</label>
                <input type="text" value={userProfile.name} onChange={e => setUserProfile({...userProfile, name: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 opacity-80">קישור לתמונת פרופיל (URL)</label>
                <input type="text" placeholder="https://..." value={userProfile.avatarUrl} onChange={e => setUserProfile({...userProfile, avatarUrl: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} dir="ltr" />
              </div>
              <button onClick={handleSaveProfile} className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all mt-4 shadow-md">
                שמור פרופיל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* מודל הגדרות עיצוב (Light / Dark) */}
      {isDesignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[150] p-4">
          <div className={`rounded-3xl w-[350px] shadow-2xl relative p-8 border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <button onClick={() => setIsDesignModalOpen(false)} className={`absolute top-4 left-4 transition-colors p-1 ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h3 className="text-xl font-bold mb-6 text-center">הגדרות עיצוב</h3>
            <div className="flex gap-4">
               <button onClick={() => setIsDarkMode(false)} className={`flex-1 py-5 rounded-2xl border-2 font-bold flex flex-col items-center gap-3 transition-all ${!isDarkMode ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                 <span className="text-3xl">☀️</span> תצוגת יום
               </button>
               <button onClick={() => setIsDarkMode(true)} className={`flex-1 py-5 rounded-2xl border-2 font-bold flex flex-col items-center gap-3 transition-all ${isDarkMode ? 'border-blue-500 bg-slate-700 text-blue-300 shadow-sm' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                 <span className="text-3xl">🌙</span> תצוגת לילה
               </button>
            </div>
          </div>
        </div>
      )}

      {/* מודל פעולות מרוכזות (כוכב ג'מיני) */}
      {bulkModalDate && bulkActionView !== 'menu' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200]">
          <div className={`rounded-3xl p-8 w-[400px] shadow-2xl relative border text-center ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            {bulkQueueIndex < bulkAppointments.length ? (
              <>
                <h3 className="text-2xl font-bold mb-2">
                  {bulkActionView === 'reminders' ? 'שליחת תזכורות' : 'ביטול תורים'}
                </h3>
                <div className={`font-bold py-1.5 px-4 rounded-full inline-block mb-6 text-sm ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                  לקוח {bulkQueueIndex + 1} מתוך {bulkAppointments.length}
                </div>
                
                <div className={`border rounded-2xl p-5 mb-8 text-right ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="font-bold text-lg mb-1">{bulkAppointments[bulkQueueIndex].title}</div>
                  <div className={`flex items-center justify-end gap-2 mb-1 ${textMuted}`}>
                    <span dir="ltr">{bulkAppointments[bulkQueueIndex].extendedProps.phone || 'אין מספר'}</span> 📱
                  </div>
                  <div className={`flex items-center justify-end gap-2 ${textMuted}`}>
                    {new Date(bulkAppointments[bulkQueueIndex].start).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})} ⏰
                  </div>
                </div>

                <button 
                  onClick={handleNextBulkWA}
                  className={`w-full text-white font-bold py-4 rounded-xl transition-all shadow-md text-lg flex items-center justify-center gap-2 ${bulkActionView === 'reminders' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  {bulkActionView === 'reminders' ? 'שלח ווטסאפ והמשך' : 'שלח ביטול והמשך'}
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl shadow-inner">✅</div>
                <h3 className="text-2xl font-bold mb-2">סיימנו!</h3>
                <p className={`${textMuted} mb-8`}>כל ההודעות נשלחו בהצלחה.</p>
                <button onClick={() => setBulkModalDate(null)} className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md">סיום וחזרה ליומן</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* מודל תפריט פעולות ליום שלם */}
      {bulkModalDate && bulkActionView === 'menu' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[150]">
          <div className={`rounded-3xl p-8 w-[400px] shadow-2xl relative border text-center ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <button onClick={() => setBulkModalDate(null)} className={`absolute top-5 left-5 transition-colors p-2 rounded-full ${isDarkMode ? 'bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-700'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <div className="text-indigo-400 flex justify-center mb-3">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"/></svg>
            </div>
            <h3 className="text-xl font-bold mb-1">פעולות ליום שלם</h3>
            <p className={`font-medium mb-8 ${textMuted}`}>
              {new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(bulkModalDate)}, {bulkModalDate.toLocaleDateString('he-IL')}
            </p>
            
            {bulkAppointments.length === 0 ? (
              <div className={`py-6 rounded-2xl font-medium ${isDarkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>אין תורים ביום זה.</div>
            ) : (
              <div className="flex flex-col gap-4">
                <button onClick={() => {setBulkActionView('reminders'); setBulkQueueIndex(0);}} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-3 text-lg">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  שלח תזכורות לכולם ({bulkAppointments.length})
                </button>
                <button onClick={handleConfirmBulkCancel} className={`w-full font-bold py-4 rounded-xl transition-all border text-lg ${isDarkMode ? 'bg-red-900/30 text-red-400 border-red-900/50 hover:bg-red-900/50' : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'}`}>
                  בטל את כל התורים ({bulkAppointments.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* מודל סטטיסטיקות */}
      {isStatsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[150] p-4">
          <div className={`rounded-3xl w-[500px] shadow-2xl overflow-hidden flex flex-col border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <div className="bg-slate-900 p-6 relative text-center border-b border-slate-800">
              <button onClick={() => setIsStatsModalOpen(false)} className="absolute top-6 left-6 text-slate-400 hover:text-white transition-colors bg-white/10 p-1.5 rounded-full">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              {statsTab !== 'menu' && (
                <button onClick={() => setStatsTab('menu')} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors bg-white/10 p-1.5 rounded-full">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              )}
              <div className="text-4xl mb-2">📊</div>
              <h2 className="text-2xl font-bold text-white">סטטיסטיקות והכנסות</h2>
            </div>
            
            <div className="p-8">
              {statsTab === 'menu' && (
                <div className="flex flex-col gap-4">
                  <button onClick={() => setStatsTab('monthly')} className={`border p-5 rounded-2xl text-right flex items-center justify-between transition-colors group ${isDarkMode ? 'bg-[#0f172a] border-slate-700 hover:bg-slate-700 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900'}`}>
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-blue-500 group-hover:scale-110 transition-transform"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-5 5"/></svg></div>
                    <div className="font-bold text-lg">תורים: החודש מול חודש שעבר</div>
                  </button>
                  <button onClick={() => setStatsTab('revenue')} className={`border p-5 rounded-2xl text-right flex items-center justify-between transition-colors group ${isDarkMode ? 'bg-emerald-900/30 border-emerald-900/50 hover:bg-emerald-900/50 text-emerald-300' : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-900'}`}>
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-emerald-500 group-hover:scale-110 transition-transform"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
                    <div className="font-bold text-lg">הכנסות צפויות לחודש הנוכחי</div>
                  </button>
                  <button onClick={() => setStatsTab('loyal')} className={`border p-5 rounded-2xl text-right flex items-center justify-between transition-colors group ${isDarkMode ? 'bg-amber-900/30 border-amber-900/50 hover:bg-amber-900/50 text-amber-300' : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900'}`}>
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-amber-500 group-hover:scale-110 transition-transform"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>
                    <div className="font-bold text-lg">הלקוחות הכי נאמנים שלך</div>
                  </button>
                </div>
              )}

              {statsTab === 'monthly' && (
                <div className="text-center">
                  <h3 className={`text-xl font-bold mb-6 ${textTitle}`}>תורים לפי חודשים</h3>
                  <div className="flex justify-center gap-8 mb-6">
                    <div className={`p-6 rounded-2xl border flex-1 ${isDarkMode ? 'bg-[#0f172a] border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                      <div className={`text-sm font-medium mb-2 ${textMuted}`}>חודש שעבר</div>
                      <div className="text-4xl font-black text-slate-400">{lastMonthApps.length}</div>
                    </div>
                    <div className={`p-6 rounded-2xl border flex-1 relative overflow-hidden ${isDarkMode ? 'bg-blue-900/30 border-blue-900/50' : 'bg-blue-50 border-blue-100'}`}>
                      <div className="absolute top-0 right-0 w-full h-1 bg-blue-500"></div>
                      <div className="text-sm text-blue-500 font-bold mb-2">החודש הנוכחי</div>
                      <div className="text-4xl font-black text-blue-500">{currentMonthApps.length}</div>
                    </div>
                  </div>
                  {currentMonthApps.length > lastMonthApps.length && (
                    <div className={`font-bold p-3 rounded-xl border ${isDarkMode ? 'text-emerald-400 bg-emerald-900/30 border-emerald-900/50' : 'text-emerald-500 bg-emerald-50 border-emerald-100'}`}>
                      מגמת עלייה! עליה של {currentMonthApps.length - lastMonthApps.length} תורים. 🚀
                    </div>
                  )}
                </div>
              )}

              {statsTab === 'revenue' && (
                <div className="text-center">
                  <h3 className={`text-xl font-bold mb-2 ${textTitle}`}>צפי הכנסות לחודש זה</h3>
                  <p className={`text-sm mb-8 ${textMuted}`}>מבוסס על ממוצע של 70 ₪ לתור</p>
                  
                  <div className="bg-gradient-to-tr from-emerald-400 to-teal-500 p-8 rounded-3xl text-white shadow-lg mb-4">
                    <div className="text-lg font-medium opacity-90 mb-1">סה"כ הכנסות צפויות</div>
                    <div className="text-6xl font-black flex justify-center items-center gap-2">
                      <span>₪</span>{totalRevenue.toLocaleString()}
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${textMuted}`}>מתוך {currentMonthApps.length} תורים שנקבעו</div>
                </div>
              )}

              {statsTab === 'loyal' && (
                <div className="text-right">
                  <h3 className={`text-xl font-bold mb-6 text-center ${textTitle}`}>הלקוחות הכי נאמנים 🏆</h3>
                  {topClients.length === 0 ? (
                     <div className={`text-center py-4 ${textMuted}`}>עדיין אין מספיק נתונים.</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {topClients.map(([name, count], index) => (
                        <div key={name} className={`flex items-center justify-between p-4 rounded-xl border ${isDarkMode ? 'bg-[#0f172a] border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                          <div className={`font-bold text-lg w-10 h-10 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-600'}`}>{count}</div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold text-lg ${textTitle}`}>{name}</span>
                            <span className="text-2xl">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* מודל פעולות לתור (דאבל קליק) */}
      {isEventActionModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[130]">
          <div className={`rounded-3xl p-6 w-[450px] shadow-2xl relative border text-center ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <button onClick={() => setIsEventActionModalOpen(false)} className={`absolute top-4 left-4 transition-colors p-1 ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h3 className="text-xl font-bold mb-1">פעולות לתור</h3>
            <p className={`font-medium mb-6 ${textMuted}`}>
              {selectedEvent.title} - {selectedEvent.start?.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}
            </p>
            
            <div className="flex gap-3 justify-center">
              <button onClick={handleSendReminder} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                תזכורת
              </button>
              <button onClick={handleOpenEditFromAction} className="flex-1 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold py-3.5 rounded-xl transition-all shadow-md">
                עריכה
              </button>
              <button onClick={handleCancelFromAction} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* מודל יצירת אירוע חדש */}
      {isNewEventModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[120]">
          <div className={`rounded-3xl p-6 w-[450px] shadow-2xl relative border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <button onClick={() => setIsNewEventModalOpen(false)} className={`absolute top-4 left-4 transition-colors p-1 ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            
            <h3 className="text-xl font-bold mb-6">יצירת תור חדש</h3>
            
            <form onSubmit={handleCreateNewEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 opacity-80">שם לקוח <span className="text-red-500">*</span></label>
                <input required type="text" value={newEventData.name} onChange={e => setNewEventData({...newEventData, name: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} placeholder="לדוגמה: ישראל ישראלי" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 opacity-80">טלפון</label>
                  <input type="tel" value={newEventData.phone} onChange={e => setNewEventData({...newEventData, phone: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} placeholder="050-0000000" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 opacity-80">אימייל <span className="text-red-500">*</span></label>
                  <input required type="email" value={newEventData.email} onChange={e => setNewEventData({...newEventData, email: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} placeholder="email@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 opacity-80">תאריך <span className="text-red-500">*</span></label>
                  <input required type="date" value={newEventData.date} onChange={e => setNewEventData({...newEventData, date: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 opacity-80">שעה <span className="text-red-500">*</span></label>
                  <input required type="time" value={newEventData.time} onChange={e => setNewEventData({...newEventData, time: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 opacity-80">שירות</label>
                <input type="text" value={newEventData.service} onChange={e => setNewEventData({...newEventData, service: e.target.value})} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} placeholder="לדוגמה: תספורת גברית וזקן" />
              </div>
              <button type="submit" className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md mt-4">
                שמור תור ושלח זימון
              </button>
            </form>
          </div>
        </div>
      )}

      {/* מודל היסטוריית תורים של לקוח מחיפוש */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100]">
          <div className={`rounded-3xl p-6 w-[400px] shadow-2xl relative border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <button onClick={() => { setIsHistoryModalOpen(false); setSelectedClientName(null); }} className={`absolute top-4 left-4 transition-colors p-1 ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h3 className="text-lg font-bold mb-5">היסטוריית תורים</h3>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pl-2 pr-1">
              {selectedClientHistory.length > 0 ? (
                selectedClientHistory.map((app, index) => {
                  const isLatest = index === 0;
                  const d = new Date(app.start)
                  return (
                    <div key={app.id} onDoubleClick={() => handleHistoryItemDoubleClick(app)} className={`p-4 rounded-xl flex flex-col gap-1 cursor-pointer transition-all relative group border ${isLatest ? (isDarkMode ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-emerald-400 bg-emerald-50/40') : (isDarkMode ? 'border-slate-700 bg-[#0f172a] hover:bg-slate-700' : 'border-slate-100 bg-slate-50 hover:bg-slate-100')}`}>
                      <div className={`absolute left-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-2 py-1 rounded shadow-sm border ${isDarkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-400 border-slate-100'}`}>דאבל קליק לעריכה</div>
                      <div className="font-bold flex items-center gap-2">
                        {app.title}
                        {isLatest && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isDarkMode ? 'text-emerald-300 bg-emerald-900/50' : 'text-emerald-600 bg-emerald-100/80'}`}>תור קרוב</span>}
                      </div>
                      <div className="text-sm text-[#3b82f6] font-medium">{d.toLocaleDateString('he-IL')} בשעה {d.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}</div>
                      {app.extendedProps?.service && <div className={`text-sm mt-1 ${textMuted}`}>שירות: {app.extendedProps.service}</div>}
                    </div>
                  )
                })
              ) : (
                <div className={`text-sm text-center py-4 ${textMuted}`}>לא נמצאו תורים בשבועיים האחרונים.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* מודל עריכת תור מתוך ההיסטוריה */}
      {editingHistoryEvent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[110]">
          <div className={`rounded-3xl p-6 w-[350px] shadow-2xl relative border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-800'}`}>
            <button onClick={() => setEditingHistoryEvent(null)} className={`absolute top-4 left-4 transition-colors p-1 ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-700'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h3 className="text-lg font-bold mb-5">עריכת תור - {editingHistoryEvent.title}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 opacity-80">תאריך</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 opacity-80">שעה</label>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className={`w-full rounded-xl px-4 py-3 outline-none border transition-colors ${bgInput}`} />
              </div>
              <div className="pt-4 flex flex-col gap-3">
                <button onClick={handleUpdateHistoryAppointment} className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-md">שמור שינויים</button>
                <button onClick={handleDeleteHistoryAppointment} className={`w-full font-bold py-3 rounded-xl transition-all border ${isDarkMode ? 'bg-red-900/30 text-red-400 border-red-900/50 hover:bg-red-900/50' : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'}`}>ביטול התור (אדום)</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        .calendar-container {
          --fc-page-bg-color: #ffffff;
          --fc-border-color: #e2e8f0;
          --fc-today-bg-color: transparent;
        }

        /* --- Dark Mode CSS Overrides --- */
        .dark-theme .calendar-container {
          --fc-page-bg-color: #0f172a;
          --fc-border-color: #334155;
          --fc-neutral-bg-color: #1e293b;
          --fc-list-event-hover-bg-color: #1e293b;
          --fc-theme-standard-border-color: #334155;
        }
        .dark-theme .fc-theme-standard .fc-scrollgrid { border: 1px solid #334155 !important; }
        .dark-theme .fc-col-header-cell { background-color: #1e293b !important; border-bottom: 1px solid #334155 !important; }
        .dark-theme .fc-daygrid-day:not(.fc-day-other) .fc-daygrid-day-number { color: #f1f5f9 !important; }
        .dark-theme .fc-timegrid-slot-label-cushion { color: #94a3b8 !important; }
        .dark-theme .fc-timegrid-axis-cushion { color: #94a3b8 !important; }
        .dark-theme .fc-timegrid-slot { border-bottom-color: #334155 !important; }
        .dark-theme .fc-timegrid-col-events { margin: 0 2px; }
        
        .fc-theme-standard .fc-scrollgrid { 
          border: 1px solid #e2e8f0 !important; 
          border-radius: 16px; 
          overflow: hidden; 
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        
        .fc-v-event, .fc-timegrid-event, .fc-daygrid-event {
          background-color: transparent !important;
          border: none !important;
        }

        .fc-col-header-cell { 
          background: #ffffff !important; 
          border-bottom: 1px solid #e2e8f0 !important; 
        }

        .fc-daygrid-day-frame { position: relative !important; }
        
        .fc-daygrid-day-top {
          position: absolute !important;
          top: 10px !important;
          left: 12px !important; 
          right: auto !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 5 !important;
          flex-direction: row !important;
        }

        .fc-daygrid-day-events { margin-top: 40px !important; }
        
        .fc-daygrid-day:not(.fc-day-other) .fc-daygrid-day-number { 
          color: #0f172a !important; 
          font-weight: 500 !important; 
          font-size: 1.05rem !important;
          padding: 0 !important;
          text-decoration: none !important;
        }
        
        .fc-day-other .fc-daygrid-day-number {
          color: #94a3b8 !important;
          font-weight: 500 !important;
          padding: 0 !important;
          text-decoration: none !important;
        }
        
        .fc-day-today .fc-daygrid-day-number {
          background-color: #3b82f6 !important;
          color: white !important;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .fc-daygrid-body tbody tr { height: 110px !important; }
        .fc-daygrid-day-frame { height: 110px !important; overflow: hidden !important; }

        .fc-daygrid-body tbody tr:has(td.fc-day-today) { height: 180px !important; }
        .fc-daygrid-body tbody tr:has(td.fc-day-today) .fc-daygrid-day-frame {
          height: 180px !important;
          overflow: visible !important; 
        }
      `}</style>
    </div>
  )
}