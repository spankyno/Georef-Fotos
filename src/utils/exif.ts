import EXIF from 'exif-js';
// @ts-ignore
import piexif from 'piexifjs';

export interface PhotoData {
  id: string;
  file: File;
  preview: string;
  lat: number | null;
  lng: number | null;
  selected: boolean;
  status: 'idle' | 'processing' | 'done';
}

export const getExifData = (file: File): Promise<{ lat: number | null; lng: number | null }> => {
  return new Promise((resolve) => {
    EXIF.getData(file as any, function (this: any) {
      const lat = EXIF.getTag(this, "GPSLatitude");
      const latRef = EXIF.getTag(this, "GPSLatitudeRef");
      const lng = EXIF.getTag(this, "GPSLongitude");
      const lngRef = EXIF.getTag(this, "GPSLongitudeRef");

      if (lat && latRef && lng && lngRef) {
        const latitude = convertDMSToDD(lat[0], lat[1], lat[2], latRef);
        const longitude = convertDMSToDD(lng[0], lng[1], lng[2], lngRef);
        resolve({ lat: latitude, lng: longitude });
      } else {
        resolve({ lat: null, lng: null });
      }
    });
  });
};

const convertDMSToDD = (degrees: number, minutes: number, seconds: number, direction: string): number => {
  let dd = degrees + minutes / 60 + seconds / 3600;
  if (direction === "S" || direction === "W") {
    dd = dd * -1;
  }
  return dd;
};

export const writeExifData = async (file: File, lat: number, lng: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dataUrl = e.target?.result as string;
        const exifObj = piexif.load(dataUrl);

        const latDeg = Math.abs(lat);
        const lngDeg = Math.abs(lng);

        const latD = Math.floor(latDeg);
        const latM = Math.floor((latDeg - latD) * 60);
        const latS = Math.round((latDeg - latD - latM / 60) * 3600 * 100);

        const lngD = Math.floor(lngDeg);
        const lngM = Math.floor((lngDeg - lngD) * 60);
        const lngS = Math.round((lngDeg - lngD - lngM / 60) * 3600 * 100);

        exifObj["GPS"] = {
          [piexif.GPSIFD.GPSLatitudeRef]: lat >= 0 ? "N" : "S",
          [piexif.GPSIFD.GPSLatitude]: [[latD, 1], [latM, 1], [latS, 100]],
          [piexif.GPSIFD.GPSLongitudeRef]: lng >= 0 ? "E" : "W",
          [piexif.GPSIFD.GPSLongitude]: [[lngD, 1], [lngM, 1], [lngS, 100]],
        };

        const exifBytes = piexif.dump(exifObj);
        const newImageDataUrl = piexif.insert(exifBytes, dataUrl);

        // Convert dataUrl to Blob
        const byteString = atob(newImageDataUrl.split(',')[1]);
        const mimeString = newImageDataUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        resolve(new Blob([ab], { type: mimeString }));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
};
