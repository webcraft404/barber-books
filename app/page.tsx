'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'

export default function BarberProDashboard() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [appointments, setAppointments] = useState<any[]>([])
  const calendarRef = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchAppointments(session.user.id)
    })
  }, [])

  const fetchAppointments = async (barberId: string) => {
    const { data } = await supabase.from('appointments').select('*').eq('barber_id', barberId)
    if (data) {
      setAppointments(data.map(app => ({
        id: app.id,
        title: app.client_name,
        start: app.start_time,
        color: '#7c3aed',
        extendedProps: { phone: app.phone, service: app.service }
      })))
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

  const cancelAppointment = async (id: string, phone: string, name: string, time: string) => {
    if (!confirm(`לבטל את התור של ${name}? תישלח הודעה ללקוח.`)) return
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (!error) {
      const msg = `היי ${name}, לצערנו התור שלך במועד ${new Date(time).toLocaleString('he-IL')} בוטל.`
      window.open(`https://wa.me/${phone.replace('-', '')}?text=${encodeURIComponent(msg)}`, '_blank')
      if (session) fetchAppointments(session.user.id)
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4" dir="rtl">
        <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-[2rem] border border-white/10 w-full max-w-md shadow-2xl">
          <h1 className="text-3xl font-black text-white mb-6 text-center tracking-tighter italic">BARBER OS</h1>
          <div className="space-y-4 text-right">
            <div>
              <label className="text-xs text-slate-400 mr-2 mb-1 block">אימייל</label>
              <input type="email" placeholder="barber@pro.com" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-blue-500 transition-all text-right" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mr-2 mb-1 block">סיסמה</label>
              <input type="password" placeholder="••••••••" className="w-full bg-black border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-blue-500 transition-all text-right" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-500 transition-all shadow-lg mt-2">כניסה למערכת</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100 flex flex-col" dir="rtl">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur-xl p-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3 font-bold text-xl text-white italic tracking-widest">
            BARBER OS
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => setSession(null))} className="text-xs text-slate-500 hover:text-red-400 transition-colors">התנתק</button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 p-2 md:p-6">
        <div className="w-full rounded-[1.5rem] border border-white/5 bg-slate-900/40 p-2 md:p-4 shadow-2xl overflow-hidden">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            titleFormat={{ month: 'long', year: 'numeric' }}
            locale="he"
            direction="rtl"
            firstDay={0}
            slotMinTime="08:00:00"
            slotMaxTime="22:00:00"
            
            // הגדרות קריטיות להצגת ה-08:30:
            slotDuration="00:30:00" 
            slotLabelInterval="00:30"
            slotLabelFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }}
            
            dayHeaderFormat={{ 
              weekday: 'short', 
              day: 'numeric',   
              omitCommas: true 
            }}
            events={appointments}
            allDaySlot={false}
            height="auto"
            nowIndicator={true}
            navLinks={true}
            eventClick={(info) => {
              cancelAppointment(info.event.id, info.event.extendedProps.phone, info.event.title, info.event.startStr)
            }}
            eventContent={(info) => (
              <div className="p-1 text-white overflow-hidden bg-gradient-to-br from-purple-600 to-indigo-700 h-full rounded-md shadow-lg border-l-4 border-white/30">
                <div className="text-[10px] font-bold leading-tight truncate text-right">{info.event.title}</div>
                <div className="text-[9px] opacity-80 truncate text-right">{info.event.extendedProps.service}</div>
              </div>
            )}
          />
        </div>
      </div>

      <style jsx global>{`
        .fc { --fc-border-color: rgba(255,255,255,0.05); --fc-today-bg-color: rgba(124, 58, 237, 0.05); }
        .fc .fc-toolbar-title { font-weight: 800; color: white; font-size: 1.4rem; }
        .fc .fc-col-header-cell { padding: 15px 0; background: rgba(0,0,0,0.2); border: none !important; }
        .fc .fc-col-header-cell-cushion { color: #94a3b8; font-size: 0.9rem; }
        
        /* עיצוב עמודת השעות בצד */
        .fc .fc-timegrid-slot-label-cushion { 
          color: #64748b; 
          font-size: 0.8rem; 
          font-weight: 600;
          padding-left: 10px;
        }
        
        .fc .fc-button-primary { background-color: #1e293b !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 12px !important; font-weight: bold !important; }
        .fc .fc-button-active { background-color: #3b82f6 !important; border-color: #3b82f6 !important; }
        
        .fc-v-event { background: none !important; border: none !important; }
        
        /* מגדיל את גובה המשבצת כדי שיהיה מקום לטקסט בחצי שעה */
        .fc-timegrid-slot { height: 4.5rem !important; border-bottom: 1px solid rgba(255,255,255,0.02) !important; }
        
        /* תיקון צבע הטקסט הלבן בראש הטבלה שראינו בתמונות הקודמות */
        .fc-theme-standard th { border: none !important; }
      `}</style>
    </main>
  )
}