import { AdminAccessDenied } from '../backend/admin-properties.js';
import { locationName } from '../backend/locations.js';

const $ = id=>document.getElementById(id);
const NEW = '__new__';
export function createLocationFields(repository,{onChange,onBusy,onDenied}) {
  let provinces=[],localities=[],zones=[],epoch=0,ready=false;
  const options=(id,rows,key,label,placeholder)=>{
    const select=$(id);select.replaceChildren(new Option(placeholder,''));
    for(const row of rows)select.add(new Option(row[label],row[key]));
    if(id !== 'province')select.add(new Option(id==='locality'?'Ingresar otra localidad…':'Agregar barrio o zona…',NEW));
  };
  function update() {
    const newLocality=$('locality').value===NEW;
    const newZone=$('zone_slug').value===NEW;
    $('new-locality-wrap').hidden=!newLocality;
    $('new_locality').disabled=!newLocality;$('new_locality').required=newLocality;
    $('new-zone-wrap').hidden=!newZone;
    $('new_zone').disabled=!newZone;$('new_zone').required=newZone;
    $('create-location').hidden=!newZone;
    const locality=localities.find(row=>row.id===$('locality').value && row.province_code===$('province').value);
    const scopedZones=zones.filter(row=>row.locality_id===locality?.id);
    ready=!!locality && scopedZones.some(row=>row.slug===$('zone_slug').value);
    onChange({zones:scopedZones,city:locality?.name || '',ready});
  }
  async function request(action) {
    const run=++epoch;let success=false;ready=false;onBusy(true);$('location-retry').hidden=true;$('location-message').textContent='Cargando ubicaciones…';
    try { await action(()=>run===epoch);if(run===epoch){success=true;$('location-message').textContent='';} }
    catch(error){
      if(run!==epoch)return;
      if(error instanceof AdminAccessDenied)onDenied(error);
      else {$('location-message').textContent=error.message || 'No pudimos cargar las ubicaciones. Volvé a cargar los datos.';$('location-retry').hidden=false;}
    } finally {if(run===epoch){update();onBusy(false);}}
    return run===epoch && success;
  }
  async function fillZones(locality,id,current) {
    const loaded=locality && locality!==NEW ? await repository.zones(locality):[];
    if(!current())return;
    zones=loaded;
    options('zone_slug',zones,'slug','name','Seleccioná un barrio o zona');
    if(id===NEW)$('zone_slug').value=NEW;
    else if(id && zones.some(row=>row.slug===id))$('zone_slug').value=id;
    else if(locality===NEW || !zones.length)$('zone_slug').value=NEW;
  }
  async function fillLocalities(province,locality,zone,current) {
    const loaded=province ? await repository.localities(province):[];if(!current())return;
    localities=loaded;
    options('locality',localities,'id','name','Seleccioná una localidad');
    if(locality===NEW)$('locality').value=NEW;
    else if(locality && localities.some(row=>row.id===locality))$('locality').value=locality;
    else if(province==='18' && localities.some(row=>row.name==='Corrientes Capital'))$('locality').value=localities.find(row=>row.name==='Corrientes Capital').id;
    else if(!localities.length)$('locality').value=NEW;
    await fillZones($('locality').value,zone,current);
  }
  $('province').addEventListener('change',()=>{localities=[];zones=[];options('locality',[],'id','name','Seleccioná una localidad');options('zone_slug',[],'slug','name','Seleccioná un barrio o zona');update();request(current=>fillLocalities($('province').value,null,null,current));});
  $('locality').addEventListener('change',()=>{zones=[];options('zone_slug',[],'slug','name','Seleccioná un barrio o zona');update();request(current=>fillZones($('locality').value,null,current));});
  $('location-retry').addEventListener('click',()=>request(current=>fillLocalities($('province').value,$('locality').value,$('zone_slug').value,current)));
  $('zone_slug').addEventListener('change',update);
  $('create-location').addEventListener('click',()=>{
    let locality;
    try {
      locality=$('locality').value===NEW?locationName($('new_locality').value):localities.find(row=>row.id===$('locality').value)?.name;
      locationName(locality);locationName($('new_zone').value);
    } catch(error){$('location-message').textContent=error.message;return;}
    request(async current=>{
      const province=$('province').value;
      const zone=await repository.create(province,locality,$('new_zone').value);
      if(!current())return;
      await fillLocalities(province,zone.locality_id,zone.slug,current);
      if(current())$('new_locality').value=$('new_zone').value='';
    }).then(success=>{if(success && ready){$('location-message').textContent='Ubicación guardada y seleccionada. Podés reutilizarla en otras propiedades.';$('zone_slug').focus();}});
  });
  return {
    ready:()=>ready,
    async mount(zone) {
      // Let initial-load errors reach the editor so no incomplete form is exposed.
      const run=++epoch;onBusy(true);$('new_locality').value=$('new_zone').value='';
      try {
        const [list,locality]=await Promise.all([repository.provinces(),zone?repository.locality(zone.locality_id):null]);
        if(run!==epoch)return;
        provinces=list;options('province',provinces,'code','name','Seleccioná una provincia');
        $('province').value=locality?.province_code || (provinces.some(row=>row.code==='18')?'18':'');
        await fillLocalities($('province').value,locality?.id,zone?.slug,()=>run===epoch);
        if(run===epoch){update();$('location-message').textContent='';}
      } finally {if(run===epoch)onBusy(false);}
    },
    reset(){epoch++;ready=false;provinces=[];localities=[];zones=[];for(const id of ['province','locality','zone_slug'])$(id).replaceChildren();$('new_locality').value=$('new_zone').value='';$('location-message').textContent='';$('location-retry').hidden=true;},
  };
}
