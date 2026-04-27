/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Upload, 
  MapPin, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Info, 
  Search,
  Mail,
  Globe,
  ExternalLink,
  ChevronRight,
  Map as MapIcon,
  Image as ImageIcon,
  X
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import JSZip from 'jszip';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getExifData, writeExifData, type PhotoData } from './utils/exif';

// Fix Leaflet icon issue by using CDN
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
// @ts-ignore
L.Marker.prototype.options.icon = DefaultIcon;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Map Search Component
function MapSearch({ onLocationFound }: { onLocationFound: (lat: number, lng: number) => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const map = useMap();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        map.setView([latitude, longitude], 13);
        onLocationFound(latitude, longitude);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSearch} className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex gap-2 w-full max-w-md px-4">
      <div className="relative flex-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar dirección..."
          className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-10 px-4 bg-emerald-600 text-white rounded-lg shadow-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 text-sm font-medium"
      >
        {loading ? '...' : 'Buscar'}
      </button>
    </form>
  );
}

// Map Click Handler Component
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function App() {
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const newFiles = Array.from(files).slice(0, 10 - photos.length);
    const photoPromises = newFiles.map(async (file) => {
      const coords = await getExifData(file);
      return {
        id: Math.random().toString(36).substring(7),
        file,
        preview: URL.createObjectURL(file),
        lat: coords.lat,
        lng: coords.lng,
        selected: false,
        status: 'idle' as const,
      };
    });

    const newPhotos = await Promise.all(photoPromises);
    setPhotos((prev) => [...prev, ...newPhotos]);
  }, [photos.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const toggleSelect = (id: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  };

  const toggleSelectAll = () => {
    const allSelected = photos.every(p => p.selected);
    setPhotos(prev => prev.map(p => ({ ...p, selected: !allSelected })));
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return prev.filter(p => p.id !== id);
    });
  };

  const applyGeoref = () => {
    if (!selectedLocation) return;
    setPhotos(prev => prev.map(p => 
      p.selected ? { ...p, lat: selectedLocation.lat, lng: selectedLocation.lng } : p
    ));
  };

  const downloadPhotos = async () => {
    const photosToDownload = photos.filter(p => p.lat !== null && p.lng !== null);
    if (photosToDownload.length === 0) return;

    if (photosToDownload.length === 1) {
      const p = photosToDownload[0];
      const blob = await writeExifData(p.file, p.lat!, p.lng!);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `georef_${p.file.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const zip = new JSZip();
      for (const p of photosToDownload) {
        const blob = await writeExifData(p.file, p.lat!, p.lng!);
        zip.file(`georef_${p.file.name}`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fotos_georeferenciadas.zip';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Georef Fotos</h1>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 100% Privado</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Sin Servidores</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Hero / Instructions */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: '1', title: 'Seleccionar imágenes', desc: 'Arrastra hasta 10 fotos JPG/JPEG.', icon: ImageIcon },
            { step: '2', title: 'Añadir geoetiquetas', desc: 'Usa el mapa o busca una dirección.', icon: MapIcon },
            { step: '3', title: 'Descargar', desc: 'Obtén tus fotos con GPS insertado.', icon: Download },
          ].map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Paso {item.step}</div>
                <h3 className="font-bold text-slate-900 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Privacy Note */}
        <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center gap-3 shadow-lg">
          <Info className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm font-medium">
            Tus archivos <span className="text-emerald-400">no se suben a ningún servidor</span>. Todo el procesamiento ocurre localmente en tu navegador para garantizar tu privacidad.
          </p>
        </div>

        {/* Upload Area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative group cursor-pointer border-2 border-dashed rounded-3xl p-12 transition-all duration-300 flex flex-col items-center justify-center text-center",
            isDragging ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50/50"
          )}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            multiple
            accept="image/jpeg,image/jpg"
            className="hidden"
          />
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Suelte sus fotos aquí</h2>
          <p className="text-slate-500 max-w-xs">O haga clic para seleccionar archivos desde su dispositivo. Máximo 10 fotos.</p>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Table Section */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      checked={photos.length > 0 && photos.every(p => p.selected)}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-bold text-slate-700">Seleccionar todas ({photos.length})</span>
                  </div>
                  <button 
                    onClick={() => setPhotos([])}
                    className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Limpiar lista
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                        <th className="px-4 py-3 w-12"></th>
                        <th className="px-4 py-3">Miniatura</th>
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Coordenadas</th>
                        <th className="px-4 py-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {photos.map((photo) => (
                        <tr key={photo.id} className={cn("group transition-colors", photo.selected ? "bg-emerald-50/30" : "hover:bg-slate-50/50")}>
                          <td className="px-4 py-3">
                            <input 
                              type="checkbox" 
                              checked={photo.selected}
                              onChange={() => toggleSelect(photo.id)}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                              <img src={photo.preview} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-slate-900 truncate max-w-[150px]">{photo.file.name}</div>
                            <div className="text-[10px] text-slate-400">{(photo.file.size / 1024 / 1024).toFixed(2)} MB</div>
                          </td>
                          <td className="px-4 py-3">
                            {photo.lat !== null ? (
                              <div className="flex flex-col">
                                <span className="text-xs font-mono text-emerald-600 font-medium">{photo.lat.toFixed(6)}</span>
                                <span className="text-xs font-mono text-emerald-600 font-medium">{photo.lng?.toFixed(6)}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300 italic">Sin georef</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button 
                              onClick={() => removePhoto(photo.id)}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <button
                  disabled={!selectedLocation || !photos.some(p => p.selected)}
                  onClick={applyGeoref}
                  className="flex-1 min-w-[200px] h-12 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
                >
                  <MapPin className="w-5 h-5" /> Aplicar a seleccionadas
                </button>
                <button
                  disabled={!photos.some(p => p.lat !== null)}
                  onClick={downloadPhotos}
                  className="flex-1 min-w-[200px] h-12 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
                >
                  <Download className="w-5 h-5" /> Descargar {photos.filter(p => p.lat !== null).length > 1 ? 'ZIP' : 'Foto'}
                </button>
              </div>
            </div>

            {/* Map Section */}
            <div className="lg:col-span-5 space-y-4 sticky top-24">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[500px] relative">
                <MapContainer center={[40.4168, -3.7038]} zoom={6} scrollWheelZoom={true}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapSearch onLocationFound={(lat, lng) => setSelectedLocation({ lat, lng })} />
                  <MapClickHandler onClick={(lat, lng) => setSelectedLocation({ lat, lng })} />
                  
                  {/* Markers for photos with location */}
                  {photos.map(p => p.lat !== null && p.lng !== null && (
                    <Marker key={p.id} position={[p.lat, p.lng]} />
                  ))}

                  {/* Current selection marker */}
                  {selectedLocation && (
                    <Marker 
                      position={[selectedLocation.lat, selectedLocation.lng]} 
                      icon={L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                      })}
                    />
                  )}
                </MapContainer>
              </div>
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <h4 className="text-sm font-bold text-emerald-900 mb-1 flex items-center gap-2">
                  <MapIcon className="w-4 h-4" /> Instrucciones del mapa
                </h4>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Haz clic en cualquier lugar del mapa para establecer una ubicación, o utiliza el buscador superior. Luego pulsa "Aplicar a seleccionadas" para asignar esas coordenadas a las fotos marcadas en la tabla.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-900">Georef Fotos</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Herramienta gratuita y privada para georeferenciar tus fotografías digitales sin comprometer tu privacidad.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">Autor</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Info className="w-4 h-4 text-slate-400" />
                  Aitor Sánchez Gutiérrez
                </div>
                <a href="mailto:blog.cottage627@passinbox.com" className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 transition-colors">
                  <Mail className="w-4 h-4 text-slate-400" />
                  blog.cottage627@passinbox.com
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">Enlaces</h4>
              <div className="space-y-2">
                <a href="https://aitorsanchez.pages.dev/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 transition-colors">
                  <Globe className="w-4 h-4 text-slate-400" />
                  Blog Personal
                </a>
                <a href="https://aitorhub.vercel.app/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 transition-colors">
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                  Más Aplicaciones
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">Tecnología</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Construido con React, Tailwind CSS y Leaflet. Los datos EXIF se procesan localmente usando librerías de código abierto.
              </p>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} Georef Fotos. Todos los derechos reservados.
            </p>
            <div className="flex items-center gap-4">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Browser-Only Processing</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
