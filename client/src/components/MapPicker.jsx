import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Link } from 'react-router-dom';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

const pin = (color='#0e9f91') => L.divIcon({
  className:'civic-pin-wrap',
  html:`<span class="civic-pin" style="--pin:${color}"><i></i></span>`,
  iconSize:[28,36],
  iconAnchor:[14,34]
});
const statusColor={Reported:'#ef4444',Acknowledged:'#f59e0b','In Progress':'#2563eb',Resolved:'#0e9f91',Rejected:'#64748b'};

function ClickHandler({ onPick }) {
  useMapEvents({ click(event){onPick?.([event.latlng.lat,event.latlng.lng]);} });
  return null;
}
function KeepLocationInView({value}) {
  const map=useMap();
  useEffect(()=>{if(value)map.flyTo(value,map.getZoom(),{duration:.45});},[map,value?.[0],value?.[1]]);
  return null;
}
export function LocationMap({ value, onPick, issues=[], interactive=true, height='100%', zoom=14 }) {
  return <MapContainer center={value||[12.9716,77.5946]} zoom={zoom} scrollWheelZoom className="map-canvas" style={{height,minHeight:height}}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <KeepLocationInView value={value}/>
    {interactive&&<ClickHandler onPick={onPick}/>}
    {value&&<Marker position={value} icon={pin('#0e9f91')}/>}
    <MarkerClusterGroup chunkedLoading>
      {issues.map(issue=><Marker key={issue.id} position={[issue.latitude,issue.longitude]} icon={pin(statusColor[issue.status])}>
        <Popup><div className="min-w-40"><p className="text-[10px] font-bold text-teal-700">{issue.category} · {issue.status}</p><p className="mt-1 text-xs font-extrabold">{issue.title}</p><Link className="mt-2 inline-block text-[11px] font-bold text-teal-700" to={`/issues/${issue.id}`}>Open report →</Link></div></Popup>
      </Marker>)}
    </MarkerClusterGroup>
  </MapContainer>;
}
