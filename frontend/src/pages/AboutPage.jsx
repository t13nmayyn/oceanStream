import AppNav from '../components/navigation/AppNav';

export default function AboutPage() {
  return <div className="about-page"><AppNav /><main className="about-content"><p className="eyebrow">INCOIS · SIH26067</p><h1>Ocean data, made readable.</h1><p>oceanStream brings together model fields, satellite products, Argo observations, and glider measurements so people can understand how the Indian Ocean changes from the surface to the deep.</p><div className="about-grid"><section><h2>Where the data comes from</h2><p>Copernicus ocean models provide continuous gridded context. Core Argo, BGC-Argo, and glider observations provide measured profiles where instruments are present.</p></section><section><h2>How to read the view</h2><p>Color shows the selected variable, depth controls the horizontal slice, and the vertical axis keeps the full water column in context. Select a point to inspect its values and provenance.</p></section></div></main></div>;
}
