import { supabase } from './supabaseclient.js'

const root=document.querySelector('#app')
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
const slugify=value=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

start()

async function start(){
  document.body.classList.add('onboarding-page')
  const {data}=await supabase.auth.getSession()
  if(!data.session) return authScreen()
  setupScreen(data.session)
}

function frame(content){
  root.innerHTML='<main class="onboarding-shell"><header><a href="/">TerraPeak Reservations</a><span>Business setup</span></header>'+content+'</main>'
}

function authScreen(){
  frame('<section class="onboarding-card auth"><p class="step-label">Owner account</p><h1>Set up your booking business</h1><p>If this is your first visit, choose <strong>Create new account</strong>. Use sign in only after your account has been created.</p><form id="ownerAuth"><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Password<input name="password" type="password" required minlength="8" autocomplete="current-password"></label><div class="actions"><button type="submit" name="action" value="signup">Create new account</button><button type="submit" name="action" value="signin" class="secondary">Sign in to existing account</button></div><p id="onboardingMessage" role="status" aria-live="polite"></p></form></section>')
  document.querySelector('#ownerAuth').onsubmit=async event=>{
    event.preventDefault()
    const values=new FormData(event.currentTarget), action=event.submitter.value
    const credentials={email:values.get('email').trim(),password:values.get('password')}
    const result=action==='signup'?await supabase.auth.signUp(credentials):await supabase.auth.signInWithPassword(credentials)
    const message=document.querySelector('#onboardingMessage')
    if(result.error){
      message.textContent=action==='signin'&&result.error.message.toLowerCase().includes('invalid login')
        ? 'That email and password do not match a staging account. If this is your first visit, choose Create new account.'
        : result.error.message
      return
    }
    if(!result.data.session){message.textContent='Check your email to confirm your account, then return here to sign in.';return}
    setupScreen(result.data.session)
  }
}

function setupScreen(session){
  frame('<section class="onboarding-intro"><p class="step-label">Guided onboarding</p><h1>Create your booking page</h1><p>Start with one service and one team member. You can add more after setup.</p></section><form id="setupForm" class="onboarding-card"><fieldset><legend>1. Business</legend><div class="field-grid"><label>Business name<input id="businessName" name="business_name" required maxlength="120" placeholder="Bright Minds"></label><label>Business type<select name="business_type"><option value="learning_centre">Learning centre</option><option value="physiotherapy">Physiotherapy</option><option value="wellness">Wellness or therapy</option><option value="classes">Classes or courses</option><option value="restaurant">Restaurant</option><option value="general">General appointments</option></select></label></div><label>Booking page URL<div class="slug-input"><span>/book/</span><input id="businessSlug" name="business_slug" required minlength="3" maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="bright-minds"></div></label></fieldset><fieldset><legend>2. First service</legend><div class="field-grid"><label>Service name<input name="service_name" required placeholder="Mathematics"></label><label>Duration<select name="duration"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60" selected>60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></label><label>Price (optional)<input name="price" type="number" min="0" step="0.01" placeholder="80"></label><label>Currency<select name="currency"><option>MYR</option><option>SGD</option><option>PHP</option><option>USD</option></select></label></div></fieldset><fieldset><legend>3. First team member</legend><div class="field-grid"><label>Name<input name="staff_name" required placeholder="Hannah Lee"></label><label>Timezone<select name="timezone"><option>Asia/Kuala_Lumpur</option><option>Asia/Singapore</option><option>Asia/Manila</option><option>UTC</option></select></label></div></fieldset><fieldset><legend>4. Weekly availability</legend><div class="days"><label><input type="checkbox" name="days" value="1" checked> Mon</label><label><input type="checkbox" name="days" value="2" checked> Tue</label><label><input type="checkbox" name="days" value="3" checked> Wed</label><label><input type="checkbox" name="days" value="4" checked> Thu</label><label><input type="checkbox" name="days" value="5" checked> Fri</label><label><input type="checkbox" name="days" value="6"> Sat</label><label><input type="checkbox" name="days" value="0"> Sun</label></div><div class="field-grid"><label>Start time<input name="start_time" type="time" value="09:00" required></label><label>End time<input name="end_time" type="time" value="17:00" required></label></div></fieldset><div class="publish-row"><div><strong>Publish immediately</strong><p>Customers can use the booking link after setup.</p></div><input name="published" type="checkbox" checked></div><button class="primary" type="submit">Create business</button><p id="onboardingMessage" role="status"></p></form>')
  const name=document.querySelector('#businessName'), slug=document.querySelector('#businessSlug')
  let slugEdited=false
  slug.oninput=()=>{slugEdited=true;slug.value=slugify(slug.value)}
  name.oninput=()=>{if(!slugEdited)slug.value=slugify(name.value)}
  document.querySelector('#setupForm').onsubmit=event=>submitSetup(event,session)
}

async function submitSetup(event,session){
  event.preventDefault()
  const form=event.currentTarget, button=form.querySelector('button[type=submit]'), message=document.querySelector('#onboardingMessage')
  const v=new FormData(form), published=v.get('published')==='on'
  if(v.get('end_time')<=v.get('start_time')){message.textContent='End time must be later than start time.';return}
  const days=v.getAll('days').map(Number)
  if(!days.length){message.textContent='Choose at least one available day.';return}
  button.disabled=true;message.textContent='Creating your business…'
  const type=v.get('business_type'), slug=slugify(v.get('business_slug'))
  const {data:created,error:createError}=await supabase.rpc('create_owner_business',{p_business_name:v.get('business_name').trim(),p_business_slug:slug,p_business_type:type,p_industry_template:type})
  if(createError){button.disabled=false;message.textContent=createError.message;return}
  const businessId=created[0].business_id
  const serviceSlug=slugify(v.get('service_name'))
  const {data:service,error:serviceError}=await supabase.from('services').insert({business_id:businessId,name:v.get('service_name').trim(),slug:serviceSlug,booking_type:type==='classes'?'class':'appointment',duration_minutes:Number(v.get('duration')),slot_interval_minutes:30,price:v.get('price')?Number(v.get('price')):null,currency:v.get('currency'),is_active:true,is_published:published}).select().single()
  if(serviceError) return partial(message,button,slug,serviceError)
  const staffSlug=slugify(v.get('staff_name'))
  const {data:staff,error:staffError}=await supabase.from('staff_members').insert({business_id:businessId,user_id:session.user.id,display_name:v.get('staff_name').trim(),slug:staffSlug,timezone:v.get('timezone'),is_active:true,is_published:published}).select().single()
  if(staffError) return partial(message,button,slug,staffError)
  const {error:linkError}=await supabase.from('staff_services').insert({staff_id:staff.id,service_id:service.id,is_active:true})
  if(linkError) return partial(message,button,slug,linkError)
  const rules=days.map(day=>({business_id:businessId,staff_id:staff.id,service_id:null,day_of_week:day,start_time:v.get('start_time'),end_time:v.get('end_time'),is_active:true}))
  const {error:ruleError}=await supabase.from('availability_rules').insert(rules)
  if(ruleError) return partial(message,button,slug,ruleError)
  location.href='/'+slug+'/dashboard/services?onboarding=complete'
}

function partial(message,button,slug,error){
  console.error(error);button.disabled=false
  message.innerHTML='Your business was created, but one setup step needs attention. <a href="/'+escapeHtml(slug)+'/dashboard/services">Continue in the dashboard</a>.'
}
