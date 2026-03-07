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
  
  const [currentView, setCurrentView] = useState('dayGridMonth')
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
    const { data, error } = await supabase.from('appointments').select('*').eq('barber_id', barberId)
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

  const renderEventContent = (eventInfo: any) => {
    if (eventInfo.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#2d3748] border border-[#4a5568] text-slate-300 text-[11px] w-full overflow-hidden my-0.5">
          <div className="w-2 h-2 rounded-full bg-[#5b8def] shrink-0"></div>
          <span className="truncate">{eventInfo.timeText} לקוח: {eventInfo.event.title} {eventInfo.event.extendedProps.phone}</span>
        </div>
      )
    }
    
    return (
      <div className="w-full h-full flex items-center bg-[#5b8def] text-slate-900 overflow-hidden px-3 cursor-pointer hover:bg-[#4a7bdd] transition-colors rounded-[4px]">
        <div className="text-[13px] font-medium leading-tight truncate">
          לקוח - {eventInfo.event.title} {eventInfo.event.extendedProps.phone}
        </div>
      </div>
    )
  }

  // מסך טעינה ראשוני
  if (isLoading) {
     return <div className="min-h-screen bg-[#111111] flex items-center justify-center text-white">טוען...</div>
  }

  // טופס התחברות (חזר למקומו!)
  if (!session) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4 dir-rtl" dir="rtl">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-[#1a1a1a] rounded-2xl p-8 border border-white/5 shadow-2xl">
          <h1 className="text-3xl font-bold text-white mb-8 text-center flex items-center justify-center gap-2">
            <span className="text-2xl">Barber</span><span className="text-[#5b8def] text-2xl">Books</span>
          </h1>
          <div className="space-y-5">
            <div>
              <label className="text-sm text-slate-400 block mb-2">אימייל</label>
              <input type="email" required className="w-full bg-[#2a2a2a] border border-white/5 p-3.5 rounded-xl text-white outline-none focus:border-[#5b8def] transition-all" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-2">סיסמה</label>
              <input type="password" required className="w-full bg-[#2a2a2a] border border-white/5 p-3.5 rounded-xl text-white outline-none focus:border-[#5b8def] transition-all" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-[#5b8def] hover:bg-[#4a7bdd] text-slate-900 font-bold py-4 rounded-xl transition-all mt-4">
              כניסה למערכת
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#111111] text-slate-200 overflow-hidden font-sans" dir="rtl">
      
      {/* סיידבר ימני */}
      <aside className="w-[280px] bg-[#1a1a1a] border-l border-white/5 flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="text-[#5b8def]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
            </svg>
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">Barber<span className="text-[#5b8def]">Books</span></span>
        </div>

        <div className="p-4 flex flex-col gap-6 flex-1">
          <button className="flex items-center justify-center gap-2 w-full bg-[#2a2a2a] hover:bg-[#333] border border-white/5 text-white py-2.5 px-4 rounded-lg transition-all font-medium text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            אירוע חדש
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-auto opacity-50"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {/* מיני קלנדר (עיצוב בלבד) */}
          <div className="bg-transparent">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="font-medium text-sm text-slate-300">מרץ 2026</span>
              <div className="flex gap-2">
                <button className="text-slate-500 hover:text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
                <button className="text-slate-500 hover:text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500 mb-2">
              <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
              {Array.from({length: 31}).map((_, i) => (
                <div key={i} className={`p-1 rounded-full ${i+1 === 7 ? 'bg-[#5b8def] text-slate-900 font-bold' : 'hover:bg-white/5 cursor-pointer'}`}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute right-3 top-3 opacity-50"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <input type="text" placeholder="חיפוש אנשים" className="w-full bg-[#2a2a2a] border border-white/5 rounded-lg py-2.5 pr-9 pl-4 text-xs outline-none focus:border-[#5b8def]/50 text-slate-300" />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium mb-3 px-2 text-slate-300">
              <span>דפים לקביעת פגישות</span>
              <button><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
        </div>
      </aside>

      {/* אזור מרכזי */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#111111]">
        
        {/* הדר עליון כמו בפוטושופ */}
        <header className="h-[72px] flex items-center justify-between px-8 bg-[#111111]">
          
          {/* צד ימין של ההדר - תאריך וחצים */}
          <div className="flex items-center gap-3">
            <span className="text-xl font-medium text-slate-200">{currentDateTitle}</span>
            <div className="flex gap-1 ml-4">
              <button onClick={() => navigateCalendar('next')} className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              <button onClick={() => navigateCalendar('prev')} className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            </div>
          </div>
          
          {/* צד שמאל של ההדר - כפתור תצוגה ואוואטר */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <button className="flex items-center gap-2 bg-[#1a1a1a] border border-white/10 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a2a] transition-colors text-slate-300">
                {currentView === 'timeGridDay' ? 'יום' : currentView === 'timeGridWeek' ? 'שבוע' : 'חודש'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div className="absolute top-full left-0 mt-1 w-full bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button onClick={() => changeView('timeGridDay')} className="block w-full text-right px-4 py-2 text-sm hover:bg-[#2a2a2a] rounded-t-lg">יום</button>
                <button onClick={() => changeView('timeGridWeek')} className="block w-full text-right px-4 py-2 text-sm hover:bg-[#2a2a2a]">שבוע</button>
                <button onClick={() => changeView('dayGridMonth')} className="block w-full text-right px-4 py-2 text-sm hover:bg-[#2a2a2a] rounded-b-lg">חודש</button>
              </div>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 via-pink-500 to-purple-500 cursor-pointer shadow-lg" title="התנתק" onClick={() => supabase.auth.signOut().then(() => setSession(null))}></div>
          </div>
          
        </header>

        {/* יומן */}
        <div className="flex-1 p-6 pt-0 overflow-hidden calendar-container relative">
          
          {currentView !== 'dayGridMonth' && (
             <div className="absolute top-2 right-6 z-10 text-[11px] text-slate-400 font-medium bg-[#111111] px-1">
               GMT+02
             </div>
          )}

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
            eventClick={(info) => {
              setSelectedEvent(info.event)
              setIsModalOpen(true)
            }}
            selectable={true}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderFormat={{ weekday: 'long', omitCommas: true }}
            events={appointments}
            allDaySlot={false}
            height="100%"
            nowIndicator={true}
            eventContent={renderEventContent}
          />
        </div>

      </main>

      {/* מודל פרטים */}
      {isModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-white border-b border-white/10 pb-3">פרטי פגישה</h3>
            <div className="space-y-3 mb-6">
              <p className="text-sm text-slate-300"><strong className="text-white">לקוח:</strong> {selectedEvent.title}</p>
              <p className="text-sm text-slate-300"><strong className="text-white">טלפון:</strong> <a href={`tel:${selectedEvent.extendedProps?.phone}`} className="text-[#5b8def] hover:underline">{selectedEvent.extendedProps?.phone}</a></p>
              <p className="text-sm text-slate-300"><strong className="text-white">זמן:</strong> {selectedEvent.start?.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={cancelAppointment} className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 py-2.5 rounded-lg text-sm font-medium transition-colors">בטל פגישה</button>
              <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* CSS מותאם אישית */}
      <style jsx global>{`
        .calendar-container {
          --fc-page-bg-color: #111111;
          --fc-border-color: #2a2a2a;
          --fc-today-bg-color: transparent;
          --fc-now-indicator-color: #ef4444;
        }
        
        .fc-theme-standard .fc-scrollgrid { border: 1px solid #2a2a2a !important; border-radius: 8px; overflow: hidden; }
        
        .fc-timegrid-event {
          margin: 1px 4px !important;
          border-radius: 4px !important;
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        
        .fc-daygrid-event {
          background: transparent !important;
          border: none !important;
          margin-top: 2px !important;
        }

        .fc .fc-timegrid-slot-minor { border-top-style: solid !important; border-color: #1a1a1a !important; }
        .fc-timegrid-slot { height: 3.5rem !important; }
        
        .fc .fc-timegrid-slot-label-cushion { color: #64748b; font-size: 0.75rem; padding: 8px !important; font-weight: 500; }

        .fc-col-header-cell { padding: 12px 0 !important; background: #111111 !important; border-bottom: 1px solid #2a2a2a !important; }
        .fc-col-header-cell-cushion { color: #cbd5e1 !important; font-weight: 400 !important; font-size: 0.85rem !important; }
        
        .fc-daygrid-day-number { color: #cbd5e1 !important; font-size: 0.85rem !important; padding: 8px !important; }
        
        /* עיצוב היום הנוכחי (שבת 7) */
        .fc-day-today .fc-daygrid-day-number {
          background-color: #5b8def !important;
          color: #111111 !important;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 4px auto;
          font-weight: bold;
        }

        .fc-timegrid-divider { display: none !important; }
        
        .fc-timegrid-now-indicator-line { border-color: #ef4444 !important; border-width: 1px !important; }
        .fc-timegrid-now-indicator-arrow { border-color: #ef4444 !important; background-color: #ef4444 !important; width: 8px !important; height: 8px !important; border-radius: 50%; margin-top: -4px !important; margin-right: -4px !important;}
      `}</style>
    </div>
  )
}