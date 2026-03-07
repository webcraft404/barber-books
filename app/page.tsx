'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import heLocale from '@fullcalendar/core/locales/he'
import { EventClickArg, EventDropArg } from '@fullcalendar/core'

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
  
  const [currentView, setCurrentView] = useState('timeGridWeek')
  const [currentDateTitle, setCurrentDateTitle] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

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
        const startTime = new Date(app.start_time)
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000) 
        return {
          id: app.id,
          title: app.client_name,
          start: app.start_time,
          end: endTime.toISOString(),
          color: '#5b8def',
          extendedProps: { phone: app.phone, service: app.service }
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

  const changeView = (viewName: string) => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      calendarApi.changeView(viewName)
      setCurrentView(viewName)
      setCurrentDateTitle(calendarApi.view.title)
    }
  }

  const navigateCalendar = (action: 'prev' | 'next') => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      if (action === 'prev') calendarApi.prev()
      if (action === 'next') calendarApi.next()
      setCurrentDateTitle(calendarApi.view.title)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (calendarRef.current) {
        setCurrentDateTitle(calendarRef.current.getApi().view.title)
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [session, currentView])

  const handleEventDrop = async (dropInfo: EventDropArg) => {
    if (!session) return
    const eventId = dropInfo.event.id
    const newStartTime = dropInfo.event.start?.toISOString()
    const { error } = await supabase.from('appointments').update({ start_time: newStartTime }).eq('id', eventId)
    if (error) dropInfo.revert()
  }

  // עיצוב שונה לחודש ולשבוע בדיוק כמו בפוטושופ
  const renderEventContent = (eventInfo: any) => {
    if (eventInfo.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#1a2235]/60 border border-[#2d3a54]/30 text-slate-300 text-[11px] w-full overflow-hidden my-[1px]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0"></div>
          <span className="truncate">{eventInfo.timeText} לקוח: {eventInfo.event.title} {eventInfo.event.extendedProps.phone}</span>
        </div>
      )
    }
    
    // תצוגת שבוע/יום
    return (
      <div className="w-full h-full flex flex-col justify-center bg-[#5b8def] text-[#0f172a] overflow-hidden px-2 rounded-md shadow-sm hover:opacity-90 transition-opacity">
        <div className="text-[12px] font-medium leading-tight truncate">
          לקוח - {eventInfo.event.title} {eventInfo.event.extendedProps.phone}
        </div>
      </div>
    )
  }

  if (isLoading) return <div className="min-h-screen bg-[#111111] flex items-center justify-center text-white">טוען...</div>

  // מסך התחברות
  if (!session) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4" dir="rtl">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-[#1a1a1a] rounded-2xl p-8 border border-[#2a2a2a] shadow-2xl">
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#3b82f6" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2" width="16" height="20" rx="2" fill="#3b82f6"/><path d="M8 2v20" stroke="#1e3a8a" strokeWidth="1"/><path d="M12 2v6l2-1.5 2 1.5V2" fill="#1e3a8a"/><path d="M7 6h10M7 10h10M7 14h10" stroke="#1e3a8a" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span className="text-3xl font-bold tracking-tight"><span className="text-white">Barber</span><span className="text-[#3b82f6]">Books</span></span>
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <label className="text-sm text-slate-400 block mb-2">אימייל</label>
              <input type="email" required className="w-full bg-[#2a2a2a] border border-[#333] p-3.5 rounded-xl text-white outline-none focus:border-[#3b82f6] transition-all" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-2">סיסמה</label>
              <input type="password" required className="w-full bg-[#2a2a2a] border border-[#333] p-3.5 rounded-xl text-white outline-none focus:border-[#3b82f6] transition-all" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold py-4 rounded-xl transition-all mt-4">כניסה למערכת</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#111111] text-slate-200 overflow-hidden font-sans" dir="rtl">
      
      {/* סיידבר ימני */}
      <aside className="w-[280px] bg-[#171717] border-l border-[#222] flex flex-col shrink-0">
        
        {/* הלוגו המדויק */}
        <div className="p-6 flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#3b82f6" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="2" width="16" height="20" rx="2" fill="#3b82f6"/>
            <path d="M8 2v20" stroke="#1e3a8a" strokeWidth="1"/>
            <path d="M12 2v6l2-1.5 2 1.5V2" fill="#1e3a8a"/>
            <path d="M7 6h10M7 10h10M7 14h10" stroke="#1e3a8a" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="text-[22px] font-bold tracking-tight"><span className="text-white">Barber</span><span className="text-[#3b82f6]">Books</span></span>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-6 flex-1">
          {/* כפתור אירוע חדש (כמו בעיצוב) */}
          <button className="flex items-center justify-between w-full bg-[#2a2a2a] hover:bg-[#333] border border-[#333] text-white py-2.5 px-4 rounded-lg transition-all text-sm">
            <div className="flex items-center gap-2 font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              אירוע חדש
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {/* מיני קלנדר פשוט (ללא קופסה) */}
          <div className="bg-transparent mt-2">
            <div className="flex justify-between items-center mb-4 px-1">
              <span className="font-medium text-sm text-slate-200">מרץ 2026</span>
              <div className="flex gap-3">
                <button className="text-slate-500 hover:text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
                <button className="text-slate-500 hover:text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500 mb-2 font-medium">
              <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-slate-300">
              {Array.from({length: 31}).map((_, i) => (
                <div key={i} className={`py-1.5 w-7 mx-auto rounded-full flex items-center justify-center ${i+1 === 7 ? 'bg-[#3b82f6] text-white font-bold' : 'hover:bg-[#2a2a2a] cursor-pointer'}`}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* חיפוש */}
          <div className="relative mt-2">
            <div className="absolute right-3 top-2.5 opacity-40"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
            <input type="text" placeholder="חיפוש אנשים" className="w-full bg-[#2a2a2a] border border-[#333] rounded-lg py-2 pr-10 pl-4 text-xs outline-none focus:border-[#5b8def]/50 text-slate-300" />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm font-medium mb-3 px-1 text-slate-200 mt-2">
              דפים לקביעת פגישות
              <button><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
        </div>
      </aside>

      {/* אזור מרכזי */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#111111]">
        
        {/* הדר עליון מדויק כמו בפוטושופ */}
        <header className="h-[80px] flex items-center justify-between px-8 bg-[#111111]">
          
          {/* ימין: תאריך וחצים */}
          <div className="flex items-center gap-4">
            <span className="text-[22px] font-medium text-slate-200 tracking-wide">{currentDateTitle}</span>
            <div className="flex gap-2">
              <button onClick={() => navigateCalendar('next')} className="p-1 hover:bg-[#2a2a2a] rounded text-slate-400 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              <button onClick={() => navigateCalendar('prev')} className="p-1 hover:bg-[#2a2a2a] rounded text-slate-400 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            </div>
          </div>
          
          {/* שמאל: כפתור תצוגה ואוואטר */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <button className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#222] transition-colors text-slate-300 shadow-sm">
                {currentView === 'timeGridDay' ? 'יום' : currentView === 'timeGridWeek' ? 'שבוע' : 'חודש'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div className="absolute top-full left-0 mt-1 w-full bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <button onClick={() => changeView('dayGridMonth')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-[#222]">חודש</button>
                <button onClick={() => changeView('timeGridWeek')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-[#222]">שבוע</button>
                <button onClick={() => changeView('timeGridDay')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-[#222]">יום</button>
              </div>
            </div>
            
            {/* האוואטר הגרדיאנטי */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#f97316] to-[#ec4899] cursor-pointer shadow-md border-2 border-[#111]" title="התנתק" onClick={() => supabase.auth.signOut().then(() => setSession(null))}></div>
          </div>
          
        </header>

        {/* יומן */}
        <div className="flex-1 p-8 pt-0 overflow-hidden calendar-container relative">
          
          {currentView !== 'dayGridMonth' && (
             <div className="absolute top-0 right-8 z-10 text-[10px] text-slate-500 font-medium px-1">
               GMT+02
             </div>
          )}

          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
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
            eventClick={(info) => {
              setSelectedEvent(info.event)
              setIsModalOpen(true)
            }}
            selectable={true}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderFormat={{ weekday: 'long', day: 'numeric', omitCommas: true }}
            events={appointments}
            allDaySlot={false}
            height="100%"
            nowIndicator={true}
            eventContent={renderEventContent}
          />
        </div>

      </main>

      {/* מודל פרטים (ללא שינוי, נראה מעולה) */}
      {isModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-white border-b border-[#333] pb-3">פרטי פגישה</h3>
            <div className="space-y-3 mb-6">
              <p className="text-sm text-slate-300"><strong className="text-white">לקוח:</strong> {selectedEvent.title}</p>
              <p className="text-sm text-slate-300"><strong className="text-white">טלפון:</strong> <a href={`tel:${selectedEvent.extendedProps?.phone}`} className="text-[#3b82f6] hover:underline">{selectedEvent.extendedProps?.phone}</a></p>
              <p className="text-sm text-slate-300"><strong className="text-white">זמן:</strong> {selectedEvent.start?.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={cancelAppointment} className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 py-2.5 rounded-lg text-sm font-medium transition-colors">בטל פגישה</button>
              <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-[#2a2a2a] hover:bg-[#333] border border-[#333] text-white py-2.5 rounded-lg text-sm font-medium transition-colors">סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* CSS דורסני שמסדר את FullCalendar שייראה בול כמו פוטושופ */}
      <style jsx global>{`
        .calendar-container {
          --fc-page-bg-color: #111111;
          --fc-border-color: #222222;
          --fc-today-bg-color: transparent;
          --fc-now-indicator-color: #ef4444;
        }
        
        /* גבולות היומן */
        .fc-theme-standard .fc-scrollgrid { 
          border: 1px solid #222 !important; 
          border-radius: 12px; 
          overflow: hidden; 
        }
        
        /* הגנה מיוחדת: רווחים לתורים כדי שלא יגעו בקווים בתצוגת שבוע! */
        .fc-timegrid-event-harness {
          margin: 0 4px !important;
        }

        .fc-timegrid-event {
          border-radius: 6px !important;
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        
        .fc-daygrid-event-harness {
          margin-top: 2px !important;
        }
        .fc-daygrid-event {
          background: transparent !important;
          border: none !important;
        }

        /* עיצוב משבצות הזמן */
        .fc .fc-timegrid-slot-minor { border-top-style: solid !important; border-color: #171717 !important; }
        .fc-timegrid-slot { height: 3.5rem !important; }
        .fc .fc-timegrid-slot-label-cushion { color: #64748b; font-size: 0.75rem; padding: 8px !important; font-weight: 400; }
        .fc-timegrid-slot-label { border: none !important; }

        /* כותרות הימים (למשל: יום ראשון) */
        .fc-col-header-cell { 
          padding: 12px 0 !important; 
          background: #111111 !important; 
          border-bottom: 1px solid #222 !important; 
        }
        .fc-col-header-cell-cushion { 
          color: #cbd5e1 !important; 
          font-weight: 400 !important; 
          font-size: 0.85rem !important; 
        }
        
        /* תאריכים בתצוגת חודש */
        .fc-daygrid-day-number { color: #94a3b8 !important; font-size: 0.85rem !important; padding: 12px !important; }
        
        /* סימון היום הנוכחי בעיגול כחול */
        .fc-day-today .fc-daygrid-day-number {
          background-color: #3b82f6 !important;
          color: white !important;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 8px auto;
          font-weight: bold;
        }

        /* הסתרת קו All Day */
        .fc-timegrid-divider { display: none !important; }
        
        /* קו השעה הנוכחית (האדום) */
        .fc-timegrid-now-indicator-line { border-color: #ef4444 !important; border-width: 1px !important; }
        .fc-timegrid-now-indicator-arrow { 
          border-color: #ef4444 !important; 
          background-color: #ef4444 !important; 
          width: 8px !important; 
          height: 8px !important; 
          border-radius: 50%; 
          margin-top: -4px !important; 
          margin-right: -4px !important;
        }
      `}</style>
    </div>
  )
}