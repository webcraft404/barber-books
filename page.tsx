'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import heLocale from '@fullcalendar/core/locales/he'
import { EventClickArg, EventDropArg } from '@fullcalendar/core'

// טיפוסים למבנה הנתונים שלנו
interface Appointment {
  id: string
  title: string
  start: string
  end: string
  color: string
  extendedProps: {
    phone: string
    service: string
  }
}

export default function BarberProDashboard() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const calendarRef = useRef<FullCalendar>(null)
  
  // ניהול מצבי תצוגה
  const [currentView, setCurrentView] = useState('timeGridWeek')
  const [currentDateTitle, setCurrentDateTitle] = useState('')
  
  // ניהול מודל (Pop-up)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // 1. טעינה ראשונית של המשתמש והתורים
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchAppointments(session.user.id)
    })
  }, [])

  // 2. מאזין לעדכונים בזמן אמת (Realtime) מ-Supabase
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

  // פונקציית שליפת התורים
  const fetchAppointments = async (barberId: string) => {
    const { data, error } = await supabase.from('appointments').select('*').eq('barber_id', barberId)
    if (error) {
      console.error('Error fetching appointments:', error)
      return
    }
    if (data) {
      setAppointments(data.map(app => {
        const startTime = new Date(app.start_time)
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000) 
        return {
          id: app.id,
          title: app.client_name,
          start: app.start_time,
          end: endTime.toISOString(),
          color: '#5b8def', // צבע כחול כמו בעיצוב החדש
          extendedProps: { phone: app.phone, service: app.service }
        }
      }))
    }
  }

  // פונקציית התחברות
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    else {
      setSession(data.session)
      if (data.session) fetchAppointments(data.session.user.id)
    }
  }

  // פונקציית ביטול תור מהמודל
  const cancelAppointment = async () => {
    if (!selectedEvent) return
    const { id, extendedProps, title, start } = selectedEvent
    
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (!error) {
      const msg = `היי ${title}, לצערנו התור שלך במועד ${start.toLocaleString('he-IL')} בוטל.`
      window.open(`https://wa.me/${extendedProps.phone.replace('-', '')}?text=${encodeURIComponent(msg)}`, '_blank')
      if (session) fetchAppointments(session.user.id)
      setIsModalOpen(false)
    }
  }

  // --- פונקציות חדשות לניהול היומן ---

  // שינוי תצוגה (יום/שבוע/חודש) מההדר המותאם אישית
  const changeView = (viewName: string) => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      calendarApi.changeView(viewName)
      setCurrentView(viewName)
      setCurrentDateTitle(calendarApi.view.title)
    }
  }

  // ניווט קדימה/אחורה
  const navigateCalendar = (action: 'prev' | 'next' | 'today') => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      if (action === 'prev') calendarApi.prev()
      if (action === 'next') calendarApi.next()
      if (action === 'today') calendarApi.today()
      setCurrentDateTitle(calendarApi.view.title)
    }
  }

  // עדכון כותרת ראשוני
  useEffect(() => {
    const timer = setTimeout(() => {
      if (calendarRef.current) {
        setCurrentDateTitle(calendarRef.current.getApi().view.title)
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [session])

  // Drag & Drop - עדכון מסד הנתונים בעת גרירת תור
  const handleEventDrop = async (dropInfo: EventDropArg) => {
    if (!session) return
    const eventId = dropInfo.event.id
    const newStartTime = dropInfo.event.start?.toISOString()
    
    // מעדכנים את Supabase בשעה החדשה
    const { error } = await supabase
      .from('appointments')
      .update({ start_time: newStartTime })
      .eq('id', eventId)
      
    if (error) {
      console.error("Error updating appointment time:", error)
      dropInfo.revert() // מחזיר את התור למקום הקודם אם יש שגיאה
    }
  }

  // לחיצה על תור - פתיחת מודל
  const handleEventClick = (clickInfo: EventClickArg) => {
    setSelectedEvent(clickInfo.event)
    setIsModalOpen(true)
  }

  // עיצוב התורים על המסך (Pills או קוביות)
  const renderEventContent = (eventInfo: any) => {
    // בתצוגת חודש נראה עיצוב שונה (כמו גלולות)
    if (eventInfo.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#5b8def]/20 text-[#5b8def] border border-[#5b8def]/30 text-xs truncate w-full">
          <div className="w-1.5 h-1.5 rounded-full bg-[#5b8def] shrink-0"></div>
          <span className="truncate">{eventInfo.timeText} {eventInfo.event.title}</span>
        </div>
      )
    }
    
    // בתצוגת שבוע/יום
    return (
      <div className="p-1 h-full w-full bg-[#5b8def] text-slate-900 rounded-[4px] overflow-hidden shadow-sm flex items-start px-2 cursor-pointer hover:bg-[#4a7bdd] transition-colors">
        <div className="text-[13px] font-medium leading-tight truncate">
          {eventInfo.event.title} - {eventInfo.event.extendedProps.phone}
        </div>
      </div>
    )
  }

  // מסך התחברות
  if (!session) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4 dir-rtl" dir="rtl">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-[#1e1e1e] rounded-2xl p-8 border border-white/10 shadow-2xl">
          <h1 className="text-3xl font-bold text-[#5b8def] mb-8 text-center">BarberBooks</h1>
          <div className="space-y-5">
            <div>
              <label className="text-sm text-slate-400 block mb-2">אימייל</label>
              <input type="email" required className="w-full bg-black/30 border border-slate-700 p-3.5 rounded-xl text-white outline-none focus:border-[#5b8def] transition-all" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-2">סיסמה</label>
              <input type="password" required className="w-full bg-black/30 border border-slate-700 p-3.5 rounded-xl text-white outline-none focus:border-[#5b8def] transition-all" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-[#5b8def] hover:bg-[#4a7bdd] text-slate-900 font-bold py-4 rounded-xl transition-all mt-4">
              כניסה למערכת
            </button>
          </div>
        </form>
      </div>
    )
  }

  // --- המערכת המרכזית ---
  return (
    <div className="flex h-screen bg-[#121212] text-slate-200 overflow-hidden" dir="rtl">
      
      {/* סיידבר ימני קבוע */}
      <aside className="w-[280px] bg-[#1a1a1a] border-l border-white/5 flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-8 h-8 bg-[#5b8def] rounded-md flex items-center justify-center text-slate-900 font-bold text-xl">B</div>
          <span className="text-2xl font-bold text-white tracking-tight">Barber<span className="text-[#5b8def]">Books</span></span>
        </div>

        <div className="p-4 flex flex-col gap-6">
          <button className="flex items-center justify-center gap-2 w-full bg-[#2a2a2a] hover:bg-[#333] border border-white/10 text-white py-3 px-4 rounded-xl transition-all font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            אירוע חדש
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-auto opacity-50"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {/* לוח שנה קטן - כרגע מבנה ויזואלי לייצוג העיצוב */}
          <div className="bg-[#121212] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-4">
              <span className="font-medium text-sm">מרץ 2026</span>
              <div className="flex gap-2">
                <button className="opacity-50 hover:opacity-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
                <button className="opacity-50 hover:opacity-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-2">
              <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {/* סתם ימים לדוגמה כדי שיראה כמו בעיצוב */}
              {Array.from({length: 31}).map((_, i) => (
                <div key={i} className={`p-1.5 rounded-full ${i+1 === 7 ? 'bg-[#5b8def] text-slate-900 font-bold' : 'hover:bg-white/10 cursor-pointer'}`}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute right-3 top-3 opacity-50"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <input type="text" placeholder="חיפוש אנשים" className="w-full bg-[#2a2a2a] border border-white/5 rounded-lg py-2.5 pr-10 pl-4 text-sm outline-none focus:border-[#5b8def]/50" />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm font-medium mb-3">
              <span>דפים לקביעת פגישות</span>
              <button><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
        </div>
      </aside>

      {/* אזור התוכן המרכזי */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* הדר עליון (Header) */}
        <header className="h-[72px] flex items-center justify-between px-6 border-b border-white/5 bg-[#121212]">
          
          <div className="flex items-center gap-4">
            {/* בורר מצבי תצוגה */}
            <div className="relative group">
              <button className="flex items-center gap-2 bg-[#2a2a2a] border border-white/10 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#333]">
                {currentView === 'timeGridDay' ? 'יום' : currentView === 'timeGridWeek' ? 'שבוע' : 'חודש'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {/* תפריט נפתח (Hover) */}
              <div className="absolute top-full right-0 mt-1 w-full bg-[#2a2a2a] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button onClick={() => changeView('timeGridDay')} className="block w-full text-right px-4 py-2 text-sm hover:bg-[#333] rounded-t-lg">יום</button>
                <button onClick={() => changeView('timeGridWeek')} className="block w-full text-right px-4 py-2 text-sm hover:bg-[#333]">שבוע</button>
                <button onClick={() => changeView('dayGridMonth')} className="block w-full text-right px-4 py-2 text-sm hover:bg-[#333] rounded-b-lg">חודש</button>
              </div>
            </div>
            
            {/* אוואטר משתמש קטן בצד שמאל (או ימין לפי הRTL) */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-purple-500 cursor-pointer" title="פרופיל" onClick={() => supabase.auth.signOut().then(() => setSession(null))}></div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xl font-medium">{currentDateTitle}</span>
            <div className="flex items-center gap-1 bg-[#2a2a2a] rounded-lg p-1 border border-white/5">
              <button onClick={() => navigateCalendar('next')} className="p-1.5 hover:bg-white/10 rounded-md"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
              <button onClick={() => navigateCalendar('today')} className="px-3 py-1 text-sm font-medium hover:bg-white/10 rounded-md">היום</button>
              <button onClick={() => navigateCalendar('prev')} className="p-1.5 hover:bg-white/10 rounded-md"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
            </div>
          </div>
          
        </header>

        {/* יומן - FullCalendar */}
        <div className="flex-1 p-6 overflow-hidden calendar-container">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={false} /* אנחנו משתמשים בהדר מותאם אישית משלנו */
            locale={heLocale}
            direction="rtl"
            firstDay={0}
            slotMinTime="08:00:00"
            slotMaxTime="23:00:00"
            slotDuration="00:30:00" /* קפיצות של חצי שעה */
            slotLabelInterval="00:30"
            editable={true} /* מאפשר Drag & Drop */
            eventDrop={handleEventDrop} /* פונקציית העדכון בסיום גרירה */
            eventClick={handleEventClick} /* פתיחת מודל בלחיצה */
            selectable={true}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderFormat={{ weekday: 'short', day: 'numeric', omitCommas: true }}
            events={appointments}
            allDaySlot={false}
            height="100%"
            nowIndicator={true}
            eventContent={renderEventContent}
          />
        </div>

      </main>

      {/* מודל (Pop-up) לפרטי תור ועריכה */}
      {isModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all">
            <h3 className="text-xl font-bold mb-4 text-white border-b border-white/10 pb-3">פרטי פגישה</h3>
            
            <div className="space-y-3 mb-6">
              <p className="text-sm text-slate-300"><strong className="text-white">לקוח:</strong> {selectedEvent.title}</p>
              <p className="text-sm text-slate-300"><strong className="text-white">שירות:</strong> {selectedEvent.extendedProps?.service || 'לא הוגדר'}</p>
              <p className="text-sm text-slate-300"><strong className="text-white">טלפון:</strong> <a href={`tel:${selectedEvent.extendedProps?.phone}`} className="text-[#5b8def] hover:underline">{selectedEvent.extendedProps?.phone}</a></p>
              <p className="text-sm text-slate-300"><strong className="text-white">זמן:</strong> {selectedEvent.start?.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={cancelAppointment}
                className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                בטל פגישה
              </button>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* עיצובים גלובליים ליומן (CSS דורסני עבור FullCalendar שיעבוד עם זנב-רוח) */}
      <style jsx global>{`
        .calendar-container {
          /* צבע רקע כללי */
          --fc-page-bg-color: #121212;
          --fc-border-color: #2a2a2a;
          --fc-today-bg-color: rgba(91, 141, 239, 0.05);
          --fc-now-indicator-color: #ef4444;
        }
        
        /* הסרת הגבול החיצוני של היומן */
        .fc-theme-standard .fc-scrollgrid {
          border: none !important;
        }

        /* עיצוב שורות השעות (החצאי שעות) */
        .fc .fc-timegrid-slot-minor {
          border-top-style: solid !important;
          border-color: rgba(255,255,255,0.03) !important;
        }
        .fc-timegrid-slot {
          height: 3.5rem !important; /* גובה משבצת */
        }
        
        /* עיצוב הטקסט של השעות */
        .fc .fc-timegrid-slot-label-cushion {
          color: #64748b;
          font-size: 0.75rem;
          padding: 8px !important;
        }

        /* עיצוב ההדר של הימים (א' 1, ב' 2...) */
        .fc-col-header-cell {
          padding: 12px 0 !important;
          background: #121212 !important;
          border-top: none !important;
        }
        .fc-col-header-cell-cushion {
          color: #94a3b8 !important;
          font-weight: 500 !important;
          font-size: 0.875rem !important;
        }

        /* הסרת הבוטון "all-day" */
        .fc-timegrid-divider {
          display: none !important;
        }

        /* עיצוב התורים עצמם כדי להסיר גבולות לבנים שמגיעים כברירת מחדל */
        .fc-v-event {
          background-color: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        /* התאמת סמן השעה הנוכחית (הקו האדום) */
        .fc-timegrid-now-indicator-line {
          border-color: #ef4444 !important;
          border-width: 2px !important;
        }
        .fc-timegrid-now-indicator-arrow {
          border-color: #ef4444 !important;
          background-color: #ef4444 !important;
        }
      `}</style>
    </div>
  )
}