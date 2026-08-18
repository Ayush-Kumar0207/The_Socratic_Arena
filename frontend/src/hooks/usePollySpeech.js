import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

let capabilitiesRequest = null;

const loadCapabilities = () => {
  if (!capabilitiesRequest) {
    capabilitiesRequest = api.get('/tts/capabilities')
      .then((response) => response.data.tts)
      .catch(() => ({ enabled: false, provider: 'amazon-polly' }));
  }
  return capabilitiesRequest;
};

export const usePollySpeech = () => {
  const [capabilities, setCapabilities] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [error, setError] = useState('');
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const requestRef = useRef(null);
  const mountedRef = useRef(true);

  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    releaseAudio();
    if (mountedRef.current) {
      setLoadingId(null);
      setPlayingId(null);
    }
  }, [releaseAudio]);

  useEffect(() => {
    mountedRef.current = true;
    loadCapabilities().then((value) => mountedRef.current && setCapabilities(value));
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      releaseAudio();
    };
  }, [releaseAudio]);

  const speak = useCallback(async (text, id = 'speech') => {
    stop();
    setError('');
    if (!capabilities?.enabled) {
      setError('Amazon Polly voice output is not configured.');
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadingId(id);
    try {
      const response = await api.post(
        '/tts/synthesize',
        { text },
        { responseType: 'blob', signal: controller.signal },
      );
      if (!mountedRef.current) return;
      const objectUrl = URL.createObjectURL(response.data);
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => {
        releaseAudio();
        if (mountedRef.current) setPlayingId(null);
      };
      audio.onerror = () => {
        releaseAudio();
        if (mountedRef.current) {
          setPlayingId(null);
          setError('The synthesized audio could not be played.');
        }
      };
      setLoadingId(null);
      setPlayingId(id);
      await audio.play();
    } catch (requestError) {
      if (requestError.code !== 'ERR_CANCELED' && mountedRef.current) {
        setError(requestError.response?.data?.message || 'Voice synthesis is unavailable.');
      }
      releaseAudio();
      if (mountedRef.current) {
        setLoadingId(null);
        setPlayingId(null);
      }
    } finally {
      requestRef.current = null;
    }
  }, [capabilities?.enabled, releaseAudio, stop]);

  return { capabilities, loadingId, playingId, error, speak, stop };
};
