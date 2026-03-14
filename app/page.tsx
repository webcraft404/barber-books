'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import heLocale from '@fullcalendar/core/locales/he'
import { EventClickArg, EventDropArg } from '@fullcalendar/core'

// פונקציית עזר ששומרת על הזמן המקומי במדויק ומונעת המרות ל-UTC
const getLocalISOString = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`
}

interface Appointment {
  id: string
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedClientHistory, setSelectedClientHistory] = useState<Appointment[]>([])
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  
  const [editingHistoryEvent, setEditingHistoryEvent] = useState<Appointment | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')

  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false)
  const [newEventData, setNewEventData] = useState({
    name: '',
    phone: '',
    email: '',
    date: '',
    time: '',
    service: 'תספורת גברית'
  })

  const clickTimeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsLoading(false)
      if (session) fetchAppointments(session.user.id)
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
          id: app.id,
          title: app.client_name,
          start: startStr,
          end: getLocalISOString(endDate),
          color: '#3b82f6', 
          extendedProps: { phone: app.phone, service: app.service, email: app.email }
        }
      }))
    }
  }

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

  // פונקציה חדשה שפותחת את חלון "אירוע חדש" עם תאריך ושעה מוזנים מראש
  const openNewEventModalWithDate = (date: Date, isMonthView: boolean) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')

    setNewEventData({
      name: '',
      phone: '',
      email: '',
      date: `${yyyy}-${mm}-${dd}`,
      time: isMonthView ? '09:00' : `${hh}:${min}`, // בתצוגת חודש נשים 09:00 כברירת מחדל
      service: 'תספורת גברית'
    })
    setIsNewEventModalOpen(true)
  }

  // הפונקציה של הכפתור בסיידבר - שמה את התאריך של היום אוטומטית
  const handleOpenNewEventFromSidebar = () => {
    const now = new Date()
    openNewEventModalWithDate(now, true)
  }

  const handleDateClick = (arg: DateClickArg) => {
    if (currentView === 'dayGridMonth') {
      if (clickTimeout.current) {
        // דאבל קליק בתצוגת חודש -> עובר לתצוגת יום
        clearTimeout(clickTimeout.current);
        clickTimeout.current = null;
        goToDateView(arg.dateStr);
      } else {
        // קליק בודד בתצוגת חודש -> פותח אירוע חדש
        clickTimeout.current = setTimeout(() => {
          clickTimeout.current = null;
          openNewEventModalWithDate(arg.date, true);
        }, 300);
      }
    } else {
      // קליק בודד בתצוגת יום/שבוע -> פותח אירוע חדש עם השעה המדויקת שלחצת עליה
      openNewEventModalWithDate(arg.date, false);
    }
  }

  const handleEventDrop = async (dropInfo: EventDropArg) => {
    if (!session) return
    const eventId = dropInfo.event.id
    const d = dropInfo.event.start;
    if (!d) return;

    const newStartString = getLocalISOString(d)
    
    const isConflict = appointments.some(app => 
      app.id !== eventId && 
      app.start === newStartString
    )

    if (isConflict) {
      alert('⚠️ כבר קיים תור במועד זה! הפעולה בוטלה.')
      dropInfo.revert()
      return
    }

    const { error } = await supabase.from('appointments').update({ start_time: newStartString }).eq('id', eventId)
    if (error) dropInfo.revert()
  }

  const filteredClients = Array.from(new Set(appointments.map(a => a.title)))
    .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery.length > 0)

  const handleClientSelect = (clientName: string) => {
    setSearchQuery('')
    setShowSearchResults(false)

    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

    const history = appointments
      .filter(app => app.title === clientName)
      .filter(app => new Date(app.start).getTime() >= twoWeeksAgo.getTime())
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

    setSelectedClientHistory(history)
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
    
    const newStartString = `${editDate}T${editTime}:00`
    
    const isConflict = appointments.some(app => 
      app.id !== editingHistoryEvent.id && 
      app.start === newStartString
    )

    if (isConflict) {
      alert('⚠️ כבר קיים תור במועד זה! אנא בחר תאריך או שעה אחרים.')
      return
    }

    const newStartDate = new Date(newStartString)
    const newEndString = getLocalISOString(new Date(newStartDate.getTime() + 30 * 60000))
    
    setSelectedClientHistory(prev => 
      prev.map(a => a.id === editingHistoryEvent.id ? { ...a, start: newStartString, end: newEndString } : a)
          .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    )

    setAppointments(prev => prev.map(a => 
      a.id === editingHistoryEvent.id ? { ...a, start: newStartString, end: newEndString } : a
    ))

    const { error } = await supabase
      .from('appointments')
      .update({ start_time: newStartString })
      .eq('id', editingHistoryEvent.id)

    if (!error) {
      const clientEmail = editingHistoryEvent.extendedProps.email;
      if (clientEmail) {
        const formatGoogleDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '')
        const calTitle = encodeURIComponent(`תור מעודכן למספרה - ${editingHistoryEvent.title}`)
        const calDetails = encodeURIComponent(`תור לתספורת שעודכן דרך המערכת.\nשירות: ${editingHistoryEvent.extendedProps.service || 'תספורת'}`)
        const googleCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&dates=${formatGoogleDate(newStartDate)}/${formatGoogleDate(new Date(newStartDate.getTime() + 30 * 60000))}&details=${calDetails}`

        const emailSubject = encodeURIComponent('עדכון קביעת תור + הזמנה ליומן')
        const emailBody = encodeURIComponent(
          `היי ${editingHistoryEvent.title},\n\nהתור שלך למספרה עודכן בהצלחה!\nתאריך חדש: ${newStartDate.toLocaleDateString('he-IL')}\nשעה חדשה: ${newStartDate.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'})}\nשירות: ${editingHistoryEvent.extendedProps.service || 'תספורת'}\n\nלשמירת התור המעודכן ביומן Google שלך, לחץ על הקישור הבא:\n${googleCalLink}\n\nנשמח לראותך!`
        )
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${clientEmail}&su=${emailSubject}&body=${emailBody}`, '_blank')
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

    const { id, extendedProps, title, start } = editingHistoryEvent
    const startDate = new Date(start)

    setSelectedClientHistory(prev => prev.filter(a => a.id !== id))
    setAppointments(prev => prev.filter(a => a.id !== id))
    
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    
    if (!error) {
      const msg = `היי ${title}, לצערנו התור שלך במועד ${startDate.toLocaleDateString('he-IL')} בוטל.`
      window.open(`https://wa.me/${extendedProps.phone.replace('-', '')}?text=${encodeURIComponent(msg)}`, '_blank')
      
      setEditingHistoryEvent(null)
      if (selectedClientHistory.length <= 1) setIsHistoryModalOpen(false)
    } else {
      if (session) fetchAppointments(session.user.id) 
    }
  }

  const handleCreateNewEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.user?.id) return

    const newStartString = `${newEventData.date}T${newEventData.time}:00`
    
    const isConflict = appointments.some(app => app.start === newStartString)
    if (isConflict) {
      alert('⚠️ כבר קיים תור במועד זה! אנא בחר תאריך או שעה אחרים.')
      return
    }

    const newStartDate = new Date(newStartString)
    const tempId = 'temp-' + Date.now()
    const newEndString = getLocalISOString(new Date(newStartDate.getTime() + 30 * 60000))

    const newApp: Appointment = {
      id: tempId,
      title: newEventData.name,
      start: newStartString,
      end: newEndString,
      color: '#3b82f6', 
      extendedProps: { phone: newEventData.phone, service: newEventData.service, email: newEventData.email }
    }
    setAppointments(prev => [...prev, newApp])

    const { data, error } = await supabase.from('appointments').insert([
      {
        barber_id: session.user.id,
        client_name: newEventData.name,
        phone: newEventData.phone,
        email: newEventData.email,
        service: newEventData.service,
        start_time: newStartString
      }
    ]).select()

    if (error) {
      alert('אירעה שגיאה ביצירת התור.')
      setAppointments(prev => prev.filter(a => a.id !== tempId)) 
      return
    }

    const formatGoogleDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '')
    const calTitle = encodeURIComponent(`תור למספרה - ${newEventData.name}`)
    const calDetails = encodeURIComponent(`תור לתספורת שנקבע דרך המערכת.\nשירות: ${newEventData.service}`)
    const googleCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&dates=${formatGoogleDate(newStartDate)}/${formatGoogleDate(new Date(newStartDate.getTime() + 30 * 60000))}&details=${calDetails}`

    const emailSubject = encodeURIComponent('אישור קביעת תור + הזמנה ליומן')
    const emailBody = encodeURIComponent(
      `היי ${newEventData.name},\n\nהתור שלך נקבע בהצלחה למספרה!\nתאריך: ${newStartDate.toLocaleDateString('he-IL')}\nשעה: ${newStartDate.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'})}\nשירות: ${newEventData.service}\n\nלשמירת התור ביומן Google שלך, לחץ על הקישור הבא:\n${googleCalLink}\n\nנשמח לראותך!`
    )
    
    if (newEventData.email) {
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${newEventData.email}&su=${emailSubject}&body=${emailBody}`, '_blank')
    }

    setNewEventData({ name: '', phone: '', email: '', date: '', time: '', service: 'תספורת גברית' })
    setIsNewEventModalOpen(false)
  }

  const renderDayHeader = (args: any) => {
    const dayName = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(args.date)
    return <div className="text-slate-700 font-semibold text-[14px] pb-2 pt-1">{dayName}</div>
  }

  const renderEventContent = (eventInfo: any) => {
    if (eventInfo.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-blue-700 text-[11px] w-full overflow-hidden my-[1px] hover:bg-blue-100 transition-colors cursor-pointer">
          <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0"></div>
          <span className="truncate font-medium">{eventInfo.timeText} לקוח: {eventInfo.event.title}</span>
        </div>
      )
    }
    
    return (
      <div className="w-full h-full bg-[#3b82f6] text-white rounded-[4px] px-3 flex flex-col justify-center hover:opacity-90 transition-opacity cursor-pointer shadow-sm border border-blue-600/20" dir="rtl">
        <div className="text-[13px] font-medium leading-tight flex items-center justify-start gap-1.5">
          <span className="truncate">לקוח - {eventInfo.event.title}</span>
        </div>
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

  if (isLoading) return <div className="min-h-screen bg-white flex items-center justify-center text-slate-900 font-medium">טוען מערכת...</div>

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans" dir="rtl">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-white rounded-3xl p-10 border border-slate-100 shadow-2xl transition-all">
          <div className="flex flex-col items-center justify-center mb-10">
             <img src="/logo.png" alt="BarberBooks" className="h-16 w-auto object-contain" />
             <div className="mt-4 text-slate-400 text-sm font-medium">ניהול חכם למספרה שלך</div>
          </div>
          <div className="space-y-6">
            <input type="email" required placeholder="אימייל" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-[#3b82f6] transition-all" onChange={(e) => setEmail(e.target.value)} />
            <input type="password" required placeholder="סיסמה" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-[#3b82f6] transition-all" onChange={(e) => setPassword(e.target.value)} />
            <button type="submit" className="w-full bg-[#3b82f6] text-white font-bold py-4.5 rounded-2xl shadow-lg w-full mt-2">כניסה למערכת</button>
          </div>
        </form>
      </div>
    )
  }

  const currentDayNum = new Date().getDate();

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans" dir="rtl">
      
      {/* סיידבר */}
      <aside className="w-[300px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-20 shadow-sm">
        <div className="h-[80px] flex items-center justify-center px-6 border-b border-slate-200">
           <img src="/logo.png" alt="BarberBooks" className="max-h-[56px] max-w-full object-contain" />
        </div>

        <div className="px-6 py-6 flex flex-col gap-6 flex-1 overflow-y-auto">
          <button 
            onClick={handleOpenNewEventFromSidebar}
            className="flex items-center justify-center w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 py-3 rounded-xl transition-all font-semibold gap-2 shadow-sm"
          >
            <span>אירוע חדש</span>
            <span className="text-lg leading-none">+</span>
          </button>

          {/* מיני קלנדר חכם ועצמאי */}
          <div className="bg-transparent mt-2">
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-slate-800 text-sm">{miniCalendarTitle}</span>
              <div className="flex gap-1 text-slate-400">
                <button onClick={() => setMiniCalendarDate(new Date(miniYear, miniMonth - 1, 1))} className="p-1 hover:text-slate-800 hover:bg-slate-50 rounded">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <button onClick={() => setMiniCalendarDate(new Date(miniYear, miniMonth + 1, 1))} className="p-1 hover:text-slate-800 hover:bg-slate-50 rounded">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[12px] text-slate-400 mb-3 font-semibold">
              <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
            </div>
            <div className="grid grid-cols-7 gap-y-2 text-center text-[13px] text-slate-700">
              {Array.from({ length: firstDayOfMiniMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="h-8 w-8"></div>
              ))}
              
              {Array.from({ length: daysInMiniMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${miniYear}-${String(miniMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                
                const isToday = dayNum === today.getDate() && miniMonth === today.getMonth() && miniYear === today.getFullYear();
                const isViewedDay = currentView === 'timeGridDay' && currentActiveDate && 
                                    currentActiveDate.getDate() === dayNum && 
                                    currentActiveDate.getMonth() === miniMonth && 
                                    currentActiveDate.getFullYear() === miniYear && 
                                    !isToday;
                
                return (
                  <div 
                    key={dayNum} 
                    onClick={() => goToDateView(dateStr)}
                    className={`h-8 w-8 flex items-center justify-center rounded-full transition-all cursor-pointer 
                      ${isToday ? 'bg-[#3b82f6] text-white font-bold shadow-md' : 
                        isViewedDay ? 'bg-slate-200 text-slate-800 font-bold shadow-sm' : 
                        'hover:bg-slate-100'}`}
                  >
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
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowSearchResults(true)
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-10 outline-none focus:bg-white focus:border-[#3b82f6] transition-all text-sm" 
            />
            
            {showSearchResults && searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {filteredClients.length > 0 ? (
                  filteredClients.map((clientName, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => handleClientSelect(clientName)}
                      className="px-4 py-3 hover:bg-slate-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0 font-medium"
                    >
                      {clientName}
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-500">לא נמצאו לקוחות</div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* אזור מרכזי */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-[80px] flex items-center justify-between px-8 bg-white border-b border-slate-200">
          <div className="flex items-center gap-6">
            <span className="text-[24px] font-bold text-slate-800 tracking-tight">{currentDateTitle}</span>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
              <button onClick={() => navigateCalendar('prev')} className="p-2 hover:bg-slate-50 rounded-r-lg text-slate-500 border-l border-slate-200">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              <button onClick={() => navigateCalendar('next')} className="p-2 hover:bg-slate-50 rounded-l-lg text-slate-500">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative group">
              <button className="flex items-center gap-2 bg-white border border-slate-200 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors text-slate-700 shadow-sm">
                {currentView === 'timeGridDay' ? 'יום' : currentView === 'timeGridWeek' ? 'שבוע' : 'חודש'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <button onClick={() => changeView('dayGridMonth')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 text-slate-700 font-medium">חודש</button>
                <button onClick={() => changeView('timeGridWeek')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 text-slate-700 font-medium border-y border-slate-100">שבוע</button>
                <button onClick={() => changeView('timeGridDay')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 text-slate-700 font-medium">יום</button>
              </div>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#f43f5e] to-[#f97316] cursor-pointer shadow-md border-2 border-white ring-1 ring-slate-100" title="התנתק" onClick={() => supabase.auth.signOut().then(() => setSession(null))}></div>
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
            editable={true}
            eventDrop={handleEventDrop}
            dateClick={handleDateClick}
            datesSet={(arg) => {
              setCurrentDateTitle(arg.view.title)
              setCurrentActiveDate(arg.view.calendar.getDate())
            }}
            eventClick={(info) => {
              setSelectedEvent(info.event)
              setIsModalOpen(true)
            }}
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

      {/* 1. מודל יצירת אירוע חדש */}
      {isNewEventModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[120]">
          <div className="bg-white rounded-2xl p-6 w-[450px] shadow-2xl relative border border-slate-100">
            <button 
              onClick={() => setIsNewEventModalOpen(false)} 
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 transition-colors p-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            
            <h3 className="text-xl font-bold text-slate-800 mb-6">יצירת תור חדש</h3>
            
            <form onSubmit={handleCreateNewEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">שם לקוח <span className="text-red-500">*</span></label>
                <input required type="text" value={newEventData.name} onChange={e => setNewEventData({...newEventData, name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] bg-slate-50" placeholder="לדוגמה: ישראל ישראלי" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">טלפון</label>
                  <input type="tel" value={newEventData.phone} onChange={e => setNewEventData({...newEventData, phone: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] bg-slate-50" placeholder="050-0000000" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">אימייל <span className="text-red-500">*</span></label>
                  <input required type="email" value={newEventData.email} onChange={e => setNewEventData({...newEventData, email: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] bg-slate-50" placeholder="email@example.com" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך <span className="text-red-500">*</span></label>
                  <input required type="date" value={newEventData.date} onChange={e => setNewEventData({...newEventData, date: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] bg-slate-50" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">שעה <span className="text-red-500">*</span></label>
                  <input required type="time" value={newEventData.time} onChange={e => setNewEventData({...newEventData, time: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] bg-slate-50" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">שירות</label>
                <input type="text" value={newEventData.service} onChange={e => setNewEventData({...newEventData, service: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] bg-slate-50" placeholder="לדוגמה: תספורת גברית וזקן" />
              </div>
              
              <button type="submit" className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md mt-4">
                שמור תור ושלח זימון
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. מודל היסטוריית תורים של לקוח מחיפוש */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl p-6 w-[400px] shadow-2xl relative border border-slate-100">
            <button onClick={() => setIsHistoryModalOpen(false)} className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 transition-colors p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h3 className="text-lg font-bold text-slate-800 mb-5">היסטוריית תורים</h3>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pl-2 pr-1">
              {selectedClientHistory.length > 0 ? (
                selectedClientHistory.map((app, index) => {
                  const isLatest = index === 0;
                  const d = new Date(app.start)
                  return (
                    <div 
                      key={app.id} 
                      onDoubleClick={() => handleHistoryItemDoubleClick(app)}
                      className={`p-4 rounded-xl flex flex-col gap-1 cursor-pointer transition-all hover:bg-slate-100 relative group
                        ${isLatest ? 'border-2 border-emerald-400 bg-emerald-50/40 shadow-sm' : 'border border-slate-100 bg-slate-50'}`}
                    >
                      <div className="absolute left-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 text-[10px] bg-white px-2 py-1 rounded shadow-sm border border-slate-100">
                        דאבל קליק לעריכה
                      </div>
                      <div className="font-bold text-slate-800 flex items-center gap-2">
                        {app.title}
                        {isLatest && <span className="text-emerald-600 text-[10px] font-bold bg-emerald-100/80 px-2 py-0.5 rounded-md">תור קרוב</span>}
                      </div>
                      <div className="text-sm text-[#3b82f6] font-medium">
                        {d.toLocaleDateString('he-IL')} בשעה {d.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      {app.extendedProps?.service && <div className="text-sm text-slate-500 mt-1">שירות: {app.extendedProps.service}</div>}
                    </div>
                  )
                })
              ) : (
                <div className="text-slate-500 text-sm text-center py-4">לא נמצאו תורים בשבועיים האחרונים.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. מודל עריכת תור מתוך ההיסטוריה */}
      {editingHistoryEvent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110]">
          <div className="bg-white rounded-2xl p-6 w-[350px] shadow-2xl relative border border-slate-100">
            <button onClick={() => setEditingHistoryEvent(null)} className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 transition-colors p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h3 className="text-lg font-bold text-slate-800 mb-5">עריכת תור - {editingHistoryEvent.title}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] transition-colors bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">שעה</label>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#3b82f6] transition-colors bg-slate-50" />
              </div>
              <div className="pt-4 flex flex-col gap-3">
                <button onClick={handleUpdateHistoryAppointment} className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-md">
                  שמור שינויים
                </button>
                <button onClick={handleDeleteHistoryAppointment} className="w-full bg-white hover:bg-red-50 text-red-500 font-bold py-3 rounded-xl transition-all border border-red-200">
                  ביטול התור (אדום)
                </button>
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
          padding: 16px 0 8px 0 !important; 
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