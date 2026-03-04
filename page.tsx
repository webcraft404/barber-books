'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import heLocale from '@fullcalendar/core/locales/he'

export default function BarberProDashboard() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [appointments, setAppointments] = useState<any[]>([])
  const calendarRef = useRef<any>(null)
  const [isMobile, setIsMobile] = useState(false)

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

    // יצירת ערוץ האזנה לטבלת התורים
    const subscription = supabase
      .channel('appointments_realtime')
      .on('postgres_changes', 
        { 
          event: '*', // מאזין לכל אירוע (INSERT, UPDATE, DELETE)
          schema: 'public', 
          table: 'appointments',
          filter: `barber_id=eq.${barberId}` // מביא רק עדכונים של הספר הזה!
        }, 
        (payload) => {
          console.log('Realtime update received!', payload)
          // ברגע שיש שינוי (לקוח קבע או ביטל תור), שואבים את הנתונים מחדש
          fetchAppointments(barberId)
        }
      )
      .subscribe()

    // ניקוי ההאזנה כשהספר מתנתק או יוצא מהעמוד
    return () => {
      supabase.removeChannel(subscription)
    }
  }, [session])

  // 3. בדיקת מסך מובייל בשביל תצוגת הקלנדר
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // פונקציית שליפת התורים והמרתם לבלוקים של חצי שעה
  const fetchAppointments = async (barberId: string) => {
    const { data, error } = await supabase.from('appointments').select('*').eq('barber_id', barberId)
    
    if (error) {
      console.error('Error fetching appointments:', error)
      return
    }

    if (data) {
      setAppointments(data.map(app => {
        const startTime = new Date(app.start_time)
        // חישוב שעת סיום: הוספת 30 דקות בדיוק (30 * 60 * 1000)
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000) 

        return {
          id: app.id,
          title: app.client_name,
          start: app.start_time,
          end: endTime.toISOString(),
          color: '#7C3AED',
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
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#0F172A] blur-0" />
        <form
          onSubmit={handleLogin}
          className="relative w-full max-w-md rounded-2xl p-8 backdrop-blur-[10px] border border-white/[0.08] shadow-2xl"
          style={{
            background: 'rgba(30, 41, 59, 0.6)',
          }}
        >
          <h1 className="text-3xl font-bold text-white mb-6 text-center tracking-tight">
            BarberBooks
          </h1>
          <div className="space-y-4 text-right">
            <div>
              <label className="text-xs text-slate-400 block mb-1">אימייל</label>
              <input
                type="email"
                placeholder="barber@pro.com"
                className="w-full bg-white/5 border border-slate-700 p-4 rounded-xl text-white outline-none focus:border-[#7C3AED] transition-all text-right placeholder:text-slate-500"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">סיסמה</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-white/5 border border-slate-700 p-4 rounded-xl text-white outline-none focus:border-[#7C3AED] transition-all text-right placeholder:text-slate-500"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#7C3AED] hover:bg-[#8B5CF6] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-[#7C3AED]/20 mt-2"
            >
              כניסה למערכת
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#0F172A]/95 backdrop-blur-xl px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3 font-bold text-xl text-white tracking-tight">
            BarberBooks
          </div>
          <button
            onClick={() => supabase.auth.signOut().then(() => setSession(null))}
            className="text-sm text-slate-500 hover:text-red-400 transition-colors"
          >
            התנתק
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 p-4 md:p-6">
        <div className="w-full rounded-2xl border border-slate-800 bg-[#1E293B] p-4 md:p-5 overflow-hidden">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
            headerToolbar={{
              start: 'prev,next',
              center: 'title',
              end: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            titleFormat={{ month: 'long', year: 'numeric' }}
            locale={heLocale}
            direction="rtl"
            firstDay={0}
            slotMinTime="08:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            slotLabelInterval="00:30"
            slotLabelFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            dayHeaderFormat={{
              weekday: 'short',
              day: 'numeric',
              omitCommas: true,
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
              <div className="p-1.5 text-white overflow-hidden h-full rounded-md text-right border-r-2 border-white/30 bg-gradient-to-l from-[#7C3AED] to-[#6D28D9]">
                <div className="text-[10px] font-bold leading-tight truncate">{info.event.title}</div>
                <div className="text-[9px] opacity-90 truncate">{info.event.extendedProps.service}</div>
              </div>
            )}
          />

          <style jsx global>{`
            .fc {
              --fc-border-color: #334155;
              --fc-today-bg-color: rgba(124, 58, 237, 0.08);
            }
            .fc .fc-toolbar-title {
              font-weight: 700;
              color: white;
              font-size: 1.25rem;
            }
            .fc .fc-col-header-cell {
              padding: 14px 0;
              background: rgba(15, 23, 42, 0.5);
              border-color: #334155 !important;
            }
            .fc .fc-col-header-cell-cushion {
              color: #94a3b8;
              font-size: 0.875rem;
            }
            .fc .fc-timegrid-slot-label-cushion {
              color: #64748b;
              font-size: 0.8rem;
              font-weight: 600;
              padding-right: 10px;
            }
            /* Segmented control - pill-shaped navigation */
            .fc .fc-toolbar-chunk {
              display: flex;
              align-items: center;
              gap: 4px;
            }
            .fc .fc-toolbar-chunk:last-child {
              background: rgba(51, 65, 85, 0.5);
              padding: 4px;
              border-radius: 9999px;
              border: 1px solid #334155;
            }
            .fc .fc-button {
              background: transparent !important;
              border: none !important;
              color: #94a3b8 !important;
              font-weight: 600 !important;
              padding: 8px 14px !important;
              border-radius: 9999px !important;
              transition: all 0.2s;
            }
            .fc .fc-button:hover {
              color: white !important;
              background: rgba(124, 58, 237, 0.2) !important;
            }
            .fc .fc-button-primary.fc-button-active {
              background: #7C3AED !important;
              color: white !important;
            }
            .fc .fc-button-group > .fc-button:first-child:not(:last-child) {
              border-radius: 9999px 0 0 9999px;
            }
            .fc .fc-button-group > .fc-button:last-child:not(:first-child) {
              border-radius: 0 9999px 9999px 0;
            }
            .fc .fc-button-group > .fc-button {
              border-radius: 9999px;
            }
            .fc .fc-prev-button,
            .fc .fc-next-button {
              background: transparent !important;
              border: 1px solid #334155 !important;
              color: #94a3b8 !important;
              border-radius: 12px !important;
            }
            .fc .fc-prev-button:hover,
            .fc .fc-next-button:hover {
              background: #334155 !important;
              color: white !important;
              border-color: #475569 !important;
            }
            .fc-v-event {
              background: none !important;
              border: none !important;
            }
            .fc-timegrid-slot {
              height: 4.5rem !important;
              border-bottom: 1px solid rgba(255, 255, 255, 0.03) !important;
            }
            .fc-theme-standard th,
            .fc-theme-standard td {
              border-color: #334155 !important;
            }
          `}</style>
        </div>
      </div>
    </main>
  )
}