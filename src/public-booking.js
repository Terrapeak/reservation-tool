import { supabase } from './supabaseclient.js'

const route = location.pathname.split('/').filter(Boolean)
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
const cash = (value, currency) => value == null ? '' : new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'MYR'}).format(Number(value))
const app = () => document.querySelector('#app')

async function start() {
  document.body.classList.add('public-booking-page')
  app().innerHTML = '<main class="booking-shell">Loading booking page…</main>'
  const businessSlug=route[1], si=route.findIndex(x=>x.toLowerCase()==='services'), ti=route.findIndex(x=>x.toLowerCase()==='team')
  const serviceSlug=si<0?null:route[si+1], staffSlug=ti<0?null:route[ti+1]
  const {data:business}=await supabase.from('businesses').select('id,business_name,business_slug,business_type').ilike('business_slug',businessSlug).maybeSingle()
  if(!business) return fail('Booking page not found.')
  document.title='Book with '+business.business_name
  if(!serviceSlug) return businessPage(business)
  const {data:service}=await supabase.from('services').select('*').eq('business_id',business.id).ilike('slug',serviceSlug).eq('is_active',true).eq('is_published',true).maybeSingle()
  if(!service) return fail('This service is not available.')
  if(!staffSlug) return servicePage(business,service)
  const {data:staff}=await supabase.from('staff_members').select('*').eq('business_id',business.id).ilike('slug',staffSlug).eq('is_active',true).eq('is_published',true).maybeSingle()
  if(!staff) return fail('This team member is not available.')
  const {data:assignment}=await supabase.from('staff_services').select('*').eq('staff_id',staff.id).eq('service_id',service.id).eq('is_active',true).maybeSingle()
  if(!assignment) return fail('This team member does not provide that service.')
  calendarPage(business,service,staff,assignment)
}

function shell(business,content,crumb=''){
  app().innerHTML='<main class="booking-shell"><header class="booking-header"><a class="booking-brand" href="/book/'+esc(business.business_slug)+'">'+esc(business.business_name)+'</a><span>Online booking</span></header>'+(crumb?'<nav class="booking-crumb">'+crumb+'</nav>':'')+content+'</main>'
}
async function businessPage(business){
  const {data:services=[]}=await supabase.from('services').select('*').eq('business_id',business.id).eq('is_active',true).eq('is_published',true).order('name')
  shell(business,'<section class="booking-hero"><p class="booking-kicker">Choose a service</p><h1>How can we help?</h1><p>Select a service to see the team and available times.</p></section><section class="booking-grid">'+(services.map(s=>'<a class="booking-card" href="/book/'+esc(business.business_slug)+'/services/'+esc(s.slug)+'"><span class="booking-type">'+esc(s.booking_type)+'</span><h2>'+esc(s.name)+'</h2><p>'+esc(s.description||'')+'</p><div><span>'+s.duration_minutes+' min</span><strong>'+cash(s.price,s.currency)+'</strong></div></a>').join('')||'<p>No services are published yet.</p>')+'</section>')
}
async function servicePage(business,service){
  const {data:items=[]}=await supabase.from('staff_services').select('custom_duration_minutes,custom_price,staff_members!inner(*)').eq('service_id',service.id).eq('is_active',true)
  const cards=items.map(item=>{const s=item.staff_members;return '<a class="booking-card staff-card" href="/book/'+esc(business.business_slug)+'/services/'+esc(service.slug)+'/team/'+esc(s.slug)+'"><div class="staff-avatar">'+(s.photo_url?'<img src="'+esc(s.photo_url)+'" alt="">':esc(s.display_name[0]))+'</div><div><h2>'+esc(s.display_name)+'</h2><p>'+esc(s.bio||'')+'</p><span>'+(item.custom_duration_minutes||service.duration_minutes)+' min · '+cash(item.custom_price??service.price,service.currency)+'</span></div></a>'}).join('')
  shell(business,'<section class="booking-hero compact"><p class="booking-kicker">'+esc(service.booking_type)+'</p><h1>'+esc(service.name)+'</h1><p>'+esc(service.description||'Choose a team member.')+'</p></section><h2>Choose your team member</h2><section class="booking-grid">'+(cards||'<p>No team members are available.</p>')+'</section>','<a href="/book/'+esc(business.business_slug)+'">Services</a><span>/</span><span>'+esc(service.name)+'</span>')
}
function calendarPage(business,service,staff,assignment){
  const today=new Date(), max=new Date(); max.setDate(max.getDate()+60)
  const avatar=staff.photo_url?'<img src="'+esc(staff.photo_url)+'" alt="">':esc(staff.display_name[0])
  const crumb='<a href="/book/'+esc(business.business_slug)+'">Services</a><span>/</span><a href="/book/'+esc(business.business_slug)+'/services/'+esc(service.slug)+'">'+esc(service.name)+'</a><span>/</span><span>'+esc(staff.display_name)+'</span>'
  shell(business,'<section class="booking-profile"><div class="staff-avatar large">'+avatar+'</div><div><p class="booking-kicker">'+esc(service.name)+'</p><h1>'+esc(staff.display_name)+'</h1><p>'+esc(staff.bio||'')+'</p><span>'+(assignment.custom_duration_minutes||service.duration_minutes)+' min · '+cash(assignment.custom_price??service.price,service.currency)+'</span></div></section><section class="calendar-panel"><div><label for="bookingDate">Choose a date</label><input id="bookingDate" type="date" min="'+dateValue(today)+'" max="'+dateValue(max)+'" value="'+dateValue(today)+'"><p class="timezone">Times shown in '+esc(staff.timezone)+'</p></div><div><h2>Available times</h2><div id="availableSlots" class="slot-grid"></div></div></section><form id="publicBookingForm" class="booking-form" hidden><h2>Your details</h2><p id="selectedTime"></p><div class="form-grid"><label>Name<input name="name" required maxlength="200"></label><label>Email<input name="email" type="email" maxlength="320"></label><label>Phone<input name="phone" maxlength="50"></label></div><label>Notes<textarea name="notes" maxlength="2000"></textarea></label><button type="submit">Confirm booking</button><p id="bookingMessage" role="status"></p></form>',crumb)
  const date=document.querySelector('#bookingDate'), slots=document.querySelector('#availableSlots'), form=document.querySelector('#publicBookingForm')
  let selected=null
  async function load(){
    selected=null;form.hidden=true;slots.innerHTML='<p>Checking availability…</p>'
    const {data,error}=await supabase.rpc('get_available_slots',{p_business_slug:business.business_slug,p_service_slug:service.slug,p_staff_slug:staff.slug,p_local_date:date.value})
    if(error){slots.innerHTML='<p>Availability could not be loaded.</p>';return}
    slots.innerHTML=data.length?data.map(x=>'<button type="button" class="slot" data-start="'+x.starts_at+'">'+new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:staff.timezone}).format(new Date(x.starts_at))+'</button>').join(''):'<p>No times available on this date.</p>'
    slots.querySelectorAll('.slot').forEach(button=>button.onclick=()=>{slots.querySelectorAll('.slot').forEach(x=>x.classList.remove('selected'));button.classList.add('selected');selected=button.dataset.start;form.hidden=false;document.querySelector('#selectedTime').textContent=date.value+' at '+button.textContent+' ('+staff.timezone+')'})
  }
  date.onchange=load
  form.onsubmit=async event=>{
    event.preventDefault();if(!selected)return
    const values=new FormData(form), button=form.querySelector('button'), message=document.querySelector('#bookingMessage')
    button.disabled=true;message.textContent='Confirming…'
    const {data,error}=await supabase.rpc('create_public_booking',{p_business_slug:business.business_slug,p_service_slug:service.slug,p_staff_slug:staff.slug,p_starts_at:selected,p_customer_name:values.get('name'),p_customer_email:values.get('email')||null,p_customer_phone:values.get('phone')||null,p_notes:values.get('notes')||null})
    button.disabled=false
    if(error){message.textContent=error.message.includes('no longer')?'That time was just taken. Please choose another.':'Booking could not be completed.';return}
    form.innerHTML='<div class="booking-success"><p class="booking-kicker">Booking confirmed</p><h2>Thank you, '+esc(values.get('name'))+'.</h2><p>Your reference is <strong>'+esc(data[0].reference)+'</strong>.</p><p>Please save this reference. Email confirmation can be enabled later.</p></div>'
  }
  load()
}
function dateValue(date){const o=date.getTimezoneOffset();return new Date(date.getTime()-o*60000).toISOString().slice(0,10)}
function fail(message){app().innerHTML='<main class="booking-shell booking-error"><h1>'+esc(message)+'</h1><p>Check the link or contact the business.</p></main>'}

if (route[0]?.toLowerCase() === 'book' && route[1]) start()
