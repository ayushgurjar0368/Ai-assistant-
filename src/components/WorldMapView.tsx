/// <reference types="google.maps" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import {
  Search,
  MapPin,
  Sparkles,
  BookmarkPlus,
  Trash2,
  ExternalLink,
  Navigation,
  AlertTriangle,
  Loader2,
  Star,
  Compass,
  X,
} from 'lucide-react';
import { useAuth, SqlSavedPlace } from '../contexts/AuthContext';
import { syncCreationToFirestore } from '../lib/firebase';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 37.7749, lng: -122.4194 };

interface DiscoveredPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsURI?: string | null;
  source: 'search' | 'saved' | 'grounding';
  sqlId?: number;
}

interface GroundingPlaceSource {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{ text: string; uri?: string }>;
}

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = String(
    (err as any)?.message || (err as any)?.status || (err as any)?.code || err || ''
  );
  return (
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OverQuotaMapError') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('429')
  );
}

function triggerQuotaBannerIfMatched(err: unknown) {
  if (isQuotaExhaustedError(err)) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

interface MarkerWithInfoProps {
  place: DiscoveredPlace;
  isSelected: boolean;
  isSaved: boolean;
  onSelect: () => void;
  onClose: () => void;
  onSave: (place: DiscoveredPlace) => void;
  onDelete?: (sqlId: number) => void;
}

const PlaceMarkerItem: React.FC<MarkerWithInfoProps> = ({
  place,
  isSelected,
  isSaved,
  onSelect,
  onClose,
  onSave,
  onDelete,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const pinColors =
    place.source === 'saved'
      ? { background: '#10b981', borderColor: '#047857', glyphColor: '#ecfdf5' }
      : place.source === 'grounding'
      ? { background: '#f59e0b', borderColor: '#b45309', glyphColor: '#fffbeb' }
      : { background: '#ec4899', borderColor: '#9d174d', glyphColor: '#fdf2f8' };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat, lng: place.lng }}
        title={place.name}
        onClick={onSelect}
      >
        <Pin
          background={pinColors.background}
          borderColor={pinColors.borderColor}
          glyphColor={pinColors.glyphColor}
          scale={isSelected ? 1.25 : 1}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={270} onCloseClick={onClose}>
          <div className="p-1 text-zinc-900 space-y-2">
            <div>
              <h4 className="font-semibold text-sm leading-snug">{place.name}</h4>
              {place.address && (
                <p className="text-xs text-zinc-600 mt-0.5">{place.address}</p>
              )}
              {typeof place.rating === 'number' && (
                <div className="flex items-center gap-1 text-xs text-amber-700 mt-1 font-medium">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  <span>{place.rating.toFixed(1)}</span>
                  {typeof place.userRatingCount === 'number' && (
                    <span className="text-zinc-500 font-normal">
                      ({place.userRatingCount.toLocaleString()})
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-zinc-200">
              {!isSaved && (
                <button
                  type="button"
                  onClick={() => onSave(place)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  Save
                </button>
              )}
              {place.sqlId && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(place.sqlId!)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
              {place.googleMapsURI && (
                <a
                  href={place.googleMapsURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium ml-auto"
                >
                  Maps <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface WorldMapContentProps {
  hasMapsKey: boolean;
}

const WorldMapContent: React.FC<WorldMapContentProps> = ({ hasMapsKey }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const { user, savedPlaces, getIdToken, refreshSqlWorkspace } = useAuth();

  const [sidebarTab, setSidebarTab] = useState<'explore' | 'ai' | 'saved'>('explore');
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [searchResults, setSearchResults] = useState<DiscoveredPlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(DEFAULT_CENTER);
  const [isSearching, setIsSearching] = useState(false);

  // Gemini Maps Grounding state
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<GroundingPlaceSource[]>([]);
  const [isAskingAi, setIsAskingAi] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Debounced AutocompleteSuggestion (Places API New)
  useEffect(() => {
    if (!hasMapsKey || !placesLib) return;
    const trimmed = searchInput.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        }
        const res = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          locationBias: {
            center: mapCenter,
            radius: 25000,
          },
        });
        if (!cancelled) {
          setSuggestions(res?.suggestions ?? []);
        }
      } catch (err: unknown) {
        triggerQuotaBannerIfMatched(err);
        if (!cancelled) {
          setSuggestions([]);
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasMapsKey, placesLib, searchInput, mapCenter]);

  const toDiscoveredPlace = (
    p: google.maps.places.Place,
    source: 'search' | 'grounding'
  ): DiscoveredPlace | null => {
    if (!p.location) return null;
    const lat = typeof p.location.lat === 'function' ? p.location.lat() : Number(p.location.lat);
    const lng = typeof p.location.lng === 'function' ? p.location.lng() : Number(p.location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: p.id || `place_${lat}_${lng}`,
      name: p.displayName || 'Selected Place',
      address: p.formattedAddress || '',
      lat,
      lng,
      rating: p.rating ?? null,
      userRatingCount: p.userRatingCount ?? null,
      googleMapsURI: p.googleMapsURI ?? null,
      source,
    };
  };

  const handleSelectSuggestion = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;
    setErrorMessage(null);
    setIsSearching(true);
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'viewport',
          'rating',
          'userRatingCount',
          'googleMapsURI',
        ],
      });
      // Reset session token after consuming Place Details
      sessionTokenRef.current = null;
      setSuggestions([]);

      const discovered = toDiscoveredPlace(place, 'search');
      if (discovered) {
        setSearchResults([discovered]);
        setSelectedPlaceId(discovered.id);
        setSearchInput(discovered.name);
        if (map) {
          if (place.viewport) {
            map.fitBounds(place.viewport);
          } else {
            map.panTo({ lat: discovered.lat, lng: discovered.lng });
            map.setZoom(15);
          }
        }
      }
    } catch (err: any) {
      triggerQuotaBannerIfMatched(err);
      setErrorMessage(err?.message || 'Unable to load place details.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleTextSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    if (!hasMapsKey || !placesLib) {
      setErrorMessage('Google Maps Places library is not available yet.');
      return;
    }

    setErrorMessage(null);
    setSuggestions([]);
    setIsSearching(true);
    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery: trimmed,
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'viewport',
          'rating',
          'userRatingCount',
          'googleMapsURI',
        ],
        locationBias: {
          center: mapCenter,
          radius: 30000,
        },
        maxResultCount: 8,
      });

      const validPlaces = (places ?? [])
        .map((p) => toDiscoveredPlace(p, 'search'))
        .filter((p): p is DiscoveredPlace => p !== null);

      setSearchResults(validPlaces);
      if (validPlaces.length > 0) {
        setSelectedPlaceId(validPlaces[0].id);
        if (map && typeof google !== 'undefined') {
          if (validPlaces.length === 1) {
            map.panTo({ lat: validPlaces[0].lat, lng: validPlaces[0].lng });
            map.setZoom(15);
          } else {
            const bounds = new google.maps.LatLngBounds();
            validPlaces.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
            map.fitBounds(bounds, 48);
          }
        }
      } else {
        setStatusMessage('No matching places found in this area.');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err: any) {
      triggerQuotaBannerIfMatched(err);
      setErrorMessage(err?.message || 'Place search failed. Please check network or quota.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFocusGroundingPlace = async (source: GroundingPlaceSource) => {
    if (!placesLib || !source.placeId) return;
    setErrorMessage(null);
    try {
      const cleanId = source.placeId.replace(/^places\//, '');
      const place = new placesLib.Place({ id: cleanId });
      await place.fetchFields({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'rating',
          'userRatingCount',
          'googleMapsURI',
        ],
      });
      const discovered = toDiscoveredPlace(place, 'grounding');
      if (discovered) {
        setSearchResults((prev) => {
          const exists = prev.some((item) => item.id === discovered.id);
          return exists ? prev : [discovered, ...prev];
        });
        setSelectedPlaceId(discovered.id);
        if (map) {
          map.panTo({ lat: discovered.lat, lng: discovered.lng });
          map.setZoom(15);
        }
      }
    } catch (err: unknown) {
      triggerQuotaBannerIfMatched(err);
    }
  };

  const handleAskMapsGrounding = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = aiQuery.trim();
    if (!trimmed || isAskingAi) return;

    setErrorMessage(null);
    setIsAskingAi(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', text: trimmed }],
          model: 'gemini-4-hydrogen',
          enableMapsGrounding: true,
          latLng: { latitude: mapCenter.lat, longitude: mapCenter.lng },
          systemInstruction:
            'You are Tojuu, helping the user explore real places with Google Maps grounding. Give concise, helpful local recommendations.',
        }),
      });
      const data = await res.json();
      if (res.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED') {
        triggerQuotaBannerIfMatched('RESOURCE_EXHAUSTED');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Maps grounding request failed');
      }
      setAiResponse(data.text || null);
      setAiSources(data.mapSources || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to query Google Maps grounding.');
    } finally {
      setIsAskingAi(false);
    }
  };

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMapCenter(next);
        if (map) {
          map.panTo(next);
          map.setZoom(14);
        }
      },
      () => {
        setErrorMessage('Location permission denied or unavailable.');
      },
      { timeout: 6000 }
    );
  }, [map]);

  const handleSavePlace = async (place: DiscoveredPlace) => {
    if (!user) {
      setErrorMessage('Sign in with Google to save places to Cloud SQL & Firestore.');
      return;
    }
    setErrorMessage(null);
    try {
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/sql/saved-places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          placeId: place.id,
          name: place.name,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          category: place.source,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save place');
      }

      await syncCreationToFirestore({
        uid: user.uid,
        creationId: `place_${place.id}_${Date.now()}`,
        kind: 'place',
        title: place.name,
        summary: place.address || `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`,
        model: 'google-maps-places',
      }).catch(console.error);

      await refreshSqlWorkspace();
      setStatusMessage(`Saved "${place.name}" to your cloud places.`);
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save place.');
    }
  };

  const handleDeleteSavedPlace = async (sqlId: number) => {
    if (!user) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/sql/saved-places/${sqlId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to remove saved place');
      if (selectedPlaceId === `saved_${sqlId}`) {
        setSelectedPlaceId(null);
      }
      await refreshSqlWorkspace();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to delete place.');
    }
  };

  const convertedSavedPlaces: DiscoveredPlace[] = savedPlaces
    .map((sp: SqlSavedPlace): DiscoveredPlace | null => {
      const lat = Number(sp.lat);
      const lng = Number(sp.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: sp.placeId,
        name: sp.name,
        address: sp.address || '',
        lat,
        lng,
        source: 'saved',
        sqlId: sp.id,
      };
    })
    .filter((p): p is DiscoveredPlace => p !== null);

  const savedPlaceIds = new Set(convertedSavedPlaces.map((p) => p.id));

  // Merge search results and saved places without duplicating same placeId
  const allMarkers: DiscoveredPlace[] = [
    ...convertedSavedPlaces,
    ...searchResults.filter((sr) => !savedPlaceIds.has(sr.id)),
  ];

  return (
    <div className="h-[calc(100dvh-56px)] w-full flex flex-col lg:flex-row bg-[#06070a] text-white overflow-hidden">
      {/* Left Discovery & Grounding Panel */}
      <aside className="w-full lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0b0e14] flex flex-col max-h-[45vh] lg:max-h-full">
        {/* Sub-tabs */}
        <div className="p-3 border-b border-white/10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSidebarTab('explore')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              sidebarTab === 'explore'
                ? 'bg-pink-500/20 border border-pink-400/40 text-pink-100'
                : 'bg-white/5 border border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Explore
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('ai')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              sidebarTab === 'ai'
                ? 'bg-amber-500/20 border border-amber-400/40 text-amber-100'
                : 'bg-white/5 border border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Local
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('saved')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              sidebarTab === 'saved'
                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-100'
                : 'bg-white/5 border border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Saved ({convertedSavedPlaces.length})
          </button>
        </div>

        {errorMessage && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-red-950/80 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {statusMessage && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-xs text-emerald-200">
            {statusMessage}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {sidebarTab === 'explore' && (
            <>
              <form onSubmit={handleTextSearch} className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search places, cafes, landmarks..."
                    className="w-full pl-3 pr-20 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-pink-400"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      title="Center on my location"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="submit"
                      disabled={isSearching || !searchInput.trim()}
                      className="px-2.5 py-1 rounded-lg bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-zinc-950 text-xs font-semibold cursor-pointer"
                    >
                      {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Go'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Autocomplete Suggestions */}
              {suggestions.length > 0 && (
                <ul className="rounded-xl border border-white/10 bg-zinc-900 divide-y divide-white/5 overflow-hidden">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => void handleSelectSuggestion(s)}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 flex items-start gap-2 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-pink-400 shrink-0 mt-0.5" />
                        <span>{s.placePrediction?.text.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Search Result Cards */}
              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((place) => {
                    const isSaved = savedPlaceIds.has(place.id);
                    const active = selectedPlaceId === place.id;
                    return (
                      <div
                        key={place.id}
                        onClick={() => {
                          setSelectedPlaceId(place.id);
                          map?.panTo({ lat: place.lat, lng: place.lng });
                          map?.setZoom(15);
                        }}
                        className={`p-3 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
                          active
                            ? 'bg-pink-500/15 border-pink-400/40'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-semibold text-white">{place.name}</h4>
                          {typeof place.rating === 'number' && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-300 shrink-0">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {place.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {place.address && (
                          <p className="text-[11px] text-zinc-400 line-clamp-2">{place.address}</p>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          {!isSaved ? (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                void handleSavePlace(place);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-[11px] text-emerald-200 cursor-pointer"
                            >
                              <BookmarkPlus className="w-3 h-3" />
                              Save Place
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-medium">Saved</span>
                          )}
                          {place.googleMapsURI && (
                            <a
                              href={place.googleMapsURI}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(ev) => ev.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white ml-auto"
                            >
                              Open <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-zinc-400 space-y-2">
                  <div className="flex items-center gap-2 text-zinc-200 font-medium">
                    <Compass className="w-4 h-4 text-pink-400" />
                    <span>Places API (New) Discovery</span>
                  </div>
                  <p>
                    Search for any coffee shop, restaurant, coworking space, or landmark near the
                    current map viewport, then save favorites directly to your account.
                  </p>
                </div>
              )}
            </>
          )}

          {sidebarTab === 'ai' && (
            <div className="space-y-3">
              <form onSubmit={handleAskMapsGrounding} className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium block">
                  Ask Tojuu with Google Maps Grounding
                </label>
                <textarea
                  rows={2}
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="e.g., Quiet late-night cafes with Wi-Fi near the map center"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 resize-none"
                />
                <button
                  type="submit"
                  disabled={isAskingAi || !aiQuery.trim()}
                  className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isAskingAi ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Grounding with Google Maps...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Find Grounded Places
                    </>
                  )}
                </button>
              </form>

              {aiResponse && (
                <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {aiResponse}
                </div>
              )}

              {aiSources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold">
                    Verified Place Sources
                  </div>
                  {aiSources.map((src, idx) => (
                    <div
                      key={`${src.uri}_${idx}`}
                      className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/25 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void handleFocusGroundingPlace(src)}
                          className="text-xs font-semibold text-amber-200 hover:underline text-left cursor-pointer"
                        >
                          {src.title}
                        </button>
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-300 hover:text-white shrink-0"
                          title="Open in Google Maps"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      {src.reviewSnippets.length > 0 && (
                        <div className="pl-2 border-l border-amber-400/30 space-y-1">
                          {src.reviewSnippets.map((snip, sIdx) => (
                            <a
                              key={sIdx}
                              href={snip.uri || src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-[11px] text-zinc-300 hover:text-white"
                            >
                              “{snip.text}”
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {sidebarTab === 'saved' && (
            <div className="space-y-2">
              {!user ? (
                <p className="text-xs text-zinc-400 p-3 rounded-xl bg-white/5 border border-white/10">
                  Sign in with Google from the top navigation bar to view and sync your saved places
                  in Cloud SQL and Firestore.
                </p>
              ) : convertedSavedPlaces.length === 0 ? (
                <p className="text-xs text-zinc-400 p-3 rounded-xl bg-white/5 border border-white/10">
                  No saved places yet. Search for a spot in Explore and tap Save Place.
                </p>
              ) : (
                convertedSavedPlaces.map((sp) => (
                  <div
                    key={`${sp.sqlId}_${sp.id}`}
                    onClick={() => {
                      setSelectedPlaceId(sp.id);
                      map?.panTo({ lat: sp.lat, lng: sp.lng });
                      map?.setZoom(15);
                    }}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-emerald-200 truncate">{sp.name}</h4>
                      {sp.address && (
                        <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{sp.address}</p>
                      )}
                    </div>
                    {sp.sqlId && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void handleDeleteSavedPlace(sp.sqlId!);
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer shrink-0"
                        aria-label="Remove saved place"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Interactive Google Map Canvas */}
      <div className="flex-1 relative min-h-[420px] h-full w-full bg-[#090b10]">
        {hasMapsKey ? (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={12}
            gestureHandling="greedy"
            style={{ width: '100%', height: '100%' }}
            onCameraChanged={(ev) => {
              const c = ev.detail?.center;
              if (c) setMapCenter({ lat: c.lat, lng: c.lng });
            }}
          >
            {allMarkers.map((place) => (
              <PlaceMarkerItem
                key={`${place.source}_${place.id}`}
                place={place}
                isSelected={selectedPlaceId === place.id}
                isSaved={savedPlaceIds.has(place.id)}
                onSelect={() => setSelectedPlaceId(place.id)}
                onClose={() => setSelectedPlaceId(null)}
                onSave={(p) => void handleSavePlace(p)}
                onDelete={place.sqlId ? (id) => void handleDeleteSavedPlace(id) : undefined}
              />
            ))}
          </GoogleMap>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <MapPin className="w-10 h-10 text-amber-400" />
            <h3 className="text-base font-semibold text-white">Google Maps Interactive Canvas</h3>
            <p className="text-xs text-zinc-400 max-w-md">
              Set <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
              in your environment to enable interactive map tiles and Places search. You can still
              use the <strong>AI Local</strong> tab on the left for Gemini Google Maps Grounding!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const WorldMapView: React.FC = () => {
  if (!MAPS_API_KEY) {
    return <WorldMapContent hasMapsKey={false} />;
  }

  return (
    <APIProvider apiKey={MAPS_API_KEY} language="en" region="US">
      <WorldMapContent hasMapsKey={true} />
    </APIProvider>
  );
};
