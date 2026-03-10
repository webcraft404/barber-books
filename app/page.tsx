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
          color: '#3b82f6', 
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

  const navigateCalendar = (action: 'prev' | 'next' | 'today') => {
    const calendarApi = calendarRef.current?.getApi()
    if (calendarApi) {
      if (action === 'prev') calendarApi.prev()
      if (action === 'next') calendarApi.next()
      if (action === 'today') calendarApi.today()
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

  const renderDayHeader = (args: any) => {
    const dayName = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(args.date)
    return <div className="text-slate-500 font-medium text-[13px] pb-2 pt-1">{dayName}</div>
  }

  const renderEventContent = (eventInfo: any) => {
    if (eventInfo.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-blue-700 text-[11px] w-full overflow-hidden my-[1px] hover:bg-blue-100 transition-colors">
          <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0"></div>
          <span className="truncate font-medium">{eventInfo.timeText} לקוח: {eventInfo.event.title} {eventInfo.event.extendedProps.phone}</span>
        </div>
      )
    }
    
    return (
      <div className="w-full h-full bg-[#3b82f6] text-white rounded-[4px] px-3 flex flex-col justify-center hover:opacity-90 transition-opacity cursor-pointer shadow-sm border border-blue-600/20" dir="rtl">
        <div className="text-[13px] font-medium leading-tight flex items-center justify-start gap-1.5">
          <span className="truncate">לקוח - {eventInfo.event.title}</span>
          <span className="opacity-90">{eventInfo.event.extendedProps.phone}</span>
        </div>
      </div>
    )
  }

  if (isLoading) return <div className="min-h-screen bg-white flex items-center justify-center text-slate-900 font-medium">טוען מערכת...</div>

  // מסך התחברות
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-white rounded-2xl p-8 border border-slate-200 shadow-xl">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="BarberBooks" className="h-12 w-auto" />
          </div>
          <div className="space-y-5">
            <div>
              <label className="text-sm text-slate-600 block mb-2 font-medium">אימייל</label>
              <input type="email" required className="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-slate-900 outline-none focus:border-[#3b82f6] focus:bg-white transition-all" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-2 font-medium">סיסמה</label>
              <input type="password" required className="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-slate-900 outline-none focus:border-[#3b82f6] focus:bg-white transition-all" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-4 rounded-xl transition-all mt-4 shadow-md shadow-blue-500/20">כניסה למערכת</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans" dir="rtl">
      
      {/* סיידבר */}
      <aside className="w-[280px] bg-slate-50 border-l border-slate-200 flex flex-col shrink-0 z-20">
        <div className="h-[80px] flex items-center px-6 border-b border-slate-200">
           <img src="/logo.png" alt="BarberBooks" className="h-9 w-auto" />
        </div>

        <div className="px-5 py-6 flex flex-col gap-6 flex-1">
          <button className="flex items-center justify-between w-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 py-2.5 px-4 rounded-lg transition-all text-sm font-medium shadow-sm">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              אירוע חדש
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          <div className="bg-transparent mt-2">
            <div className="flex justify-between items-center mb-4 px-1">
              <span className="font-semibold text-sm text-slate-700">מרץ 2026</span>
              <div className="flex gap-3">
                <button className="text-slate-400 hover:text-slate-700"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></button>
                <button className="text-slate-400 hover:text-slate-700"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-2 font-semibold">
              <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-slate-600 font-medium">
              {Array.from({length: 31}).map((_, i) => (
                <div key={i} className={`py-1.5 w-7 mx-auto rounded-full flex items-center justify-center ${i+1 === 7 ? 'bg-[#3b82f6] text-white shadow-sm' : 'hover:bg-slate-200 cursor-pointer'}`}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-2">
            <div className="absolute right-3 top-2.5 text-slate-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
            <input type="text" placeholder="חיפוש אנשים" className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pr-10 pl-4 text-xs outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] text-slate-700 placeholder:text-slate-400 transition-all shadow-sm" />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm font-semibold mb-3 px-1 text-slate-600 mt-2">
              דפים לקביעת פגישות
              <button className="text-slate-400 hover:text-slate-700"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
          </div>
        </div>
      </aside>

      {/* אזור מרכזי */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        
        {/* הדר */}
        <header className="h-[80px] flex items-center justify-between px-8 bg-white z-10 border-b border-slate-200">
          <div className="flex items-center gap-6">
            <span className="text-[22px] font-semibold text-slate-800 tracking-wide pt-1">{currentDateTitle}</span>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
              <button onClick={() => navigateCalendar('next')} className="p-2 hover:bg-slate-50 rounded-r-lg text-slate-500 hover:text-slate-800 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              <button onClick={() => navigateCalendar('today')} className="px-3.5 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors font-semibold border-x border-slate-200">
                היום
              </button>
              <button onClick={() => navigateCalendar('prev')} className="p-2 hover:bg-slate-50 rounded-l-lg text-slate-500 hover:text-slate-800 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors text-slate-700 shadow-sm">
                {currentView === 'timeGridDay' ? 'יום' : currentView === 'timeGridWeek' ? 'שבוע' : 'חודש'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <button onClick={() => changeView('dayGridMonth')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 text-slate-700">חודש</button>
                <button onClick={() => changeView('timeGridWeek')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 text-slate-700">שבוע</button>
                <button onClick={() => changeView('timeGridDay')} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 text-slate-700">יום</button>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#f97316] to-[#ec4899] cursor-pointer shadow-md border-2 border-white ring-1 ring-slate-200" title="התנתק" onClick={() => supabase.auth.signOut().then(() => setSession(null))}></div>
          </div>
        </header>

        <div className="flex-1 p-8 pt-0 overflow-hidden calendar-container relative mt-6">
          
          {currentView !== 'dayGridMonth' && (
             <div className="absolute top-0 right-8 z-10 text-[10px] text-slate-400 font-semibold px-1 bg-white">
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
            dayHeaderContent={renderDayHeader}
            events={appointments}
            allDaySlot={false}
            height="100%"
            nowIndicator={true}
            fixedWeekCount={false} 
            eventContent={renderEventContent}
          />
        </div>
      </main>

      {/* מודל פרטים */}
      {isModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-slate-900 border-b border-slate-100 pb-3">פרטי פגישה</h3>
            <div className="space-y-3 mb-6">
              <p className="text-sm text-slate-600"><strong className="text-slate-900">לקוח:</strong> {selectedEvent.title}</p>
              <p className="text-sm text-slate-600"><strong className="text-slate-900">טלפון:</strong> <a href={`tel:${selectedEvent.extendedProps?.phone}`} className="text-[#3b82f6] font-medium hover:underline">{selectedEvent.extendedProps?.phone}</a></p>
              <p className="text-sm text-slate-600"><strong className="text-slate-900">זמן:</strong> {selectedEvent.start?.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={cancelAppointment} className="flex-1 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white border border-red-100 py-2.5 rounded-lg text-sm font-semibold transition-colors">בטל פגישה</button>
              <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* CSS תואם למראה בהיר ויוקרתי */}
      <style jsx global>{`
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f8fafc; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        .calendar-container {
          --fc-page-bg-color: #ffffff;
          --fc-border-color: #e2e8f0;
          --fc-today-bg-color: transparent;
          --fc-now-indicator-color: #ef4444;
        }
        
        .fc-theme-standard .fc-scrollgrid { 
          border: 1px solid #e2e8f0 !important; 
          border-radius: 12px; 
          overflow: hidden; 
        }
        
        .fc-v-event, .fc-timegrid-event, .fc-daygrid-event {
          background-color: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        .fc-timegrid-event { margin: 1px 4px !important; }
        .fc-daygrid-event { margin-top: 2px !important; }
        .fc-timegrid-event .fc-event-main, .fc-daygrid-event .fc-event-main { padding: 0 !important; }

        .fc-col-header-cell { 
          padding: 12px 0 0 0 !important; 
          background: #ffffff !important; 
          border-bottom: 1px solid #e2e8f0 !important; 
        }

        /* -----------------------------------------------------------------
           תיקון קריטי 1: העברת המספרים לפינה הימנית העליונה!
           ----------------------------------------------------------------- */
        .fc-daygrid-day-frame {
          position: relative !important;
        }
        
        .fc-daygrid-day-top {
          position: absolute !important;
          top: 8px !important;
          right: 12px !important; /* דוחף לצד ימין */
          left: auto !important; /* מנקה את השמאל מקודם */
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 5 !important;
        }

        /* מרווח עליון לתורים כדי שלא יכסו את המספר בצד ימין למעלה */
        .fc-daygrid-day-events {
          margin-top: 36px !important;
          margin-left: 0 !important; 
        }
        
        /* -----------------------------------------------------------------
           תיקון קריטי 2: צבע נעים יותר ופונט פחות מודגש (600 במקום 800)
           ----------------------------------------------------------------- */
        .fc-daygrid-day:not(.fc-day-other) .fc-daygrid-day-number { 
          color: #1e293b !important; 
          font-weight: 600 !important; 
          font-size: 1rem !important;
          padding: 0 !important;
        }
        
        .fc-day-other .fc-daygrid-day-number {
          color: #94a3b8 !important;
          font-weight: 500 !important;
          padding: 0 !important;
        }
        
        /* העיגול הכחול של "היום" מתיישר ימינה ומוקטן טיפונת למראה אלגנטי */
        .fc-day-today .fc-daygrid-day-number {
          background-color: #3b82f6 !important;
          color: white !important;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 !important; 
        }

        /* -----------------------------------------------------------------
           הגדלת השבוע הנוכחי בלבד
           ----------------------------------------------------------------- */
        .fc-daygrid-body tbody tr {
          height: 100px !important; 
        }
        
        .fc-daygrid-day-frame {
          height: 100px !important;
          overflow: hidden !important; 
        }

        tr:has(.fc-day-today) {
          height: 180px !important;
        }
        
        tr:has(.fc-day-today) .fc-daygrid-day-frame {
          height: 180px !important;
          overflow: visible !important; 
        }

        /* עיצוב שאר היומן */
        .fc .fc-timegrid-slot-minor { border-top-style: solid !important; border-color: #f1f5f9 !important; }
        .fc-timegrid-slot { height: 3.5rem !important; }
        .fc .fc-timegrid-slot-label-cushion { color: #64748b; font-size: 0.75rem; padding: 8px !important; font-weight: 500; }
        .fc-timegrid-slot-label { border: none !important; }
        .fc-timegrid-divider { display: none !important; }
        
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