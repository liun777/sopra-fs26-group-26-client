import CardShuffleLoader from "./components/CardShuffleLoader";

export default function Loading() {
  return (
    <div className="page-transition-loader-overlay page-transition-loader-overlay-static">
      <CardShuffleLoader />
    </div>
  );
}
