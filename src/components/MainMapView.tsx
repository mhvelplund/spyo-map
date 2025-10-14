import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MapContainer from "./MapContainer";
import { databaseService } from "../services/DatabaseService";
import { extractImageId } from "../utils/urlUtils";
import type { ImageRecord } from "../types";
import "./MainMapView.css";

const MainMapView: React.FC = () => {
	const navigate = useNavigate();
	const [images, setImages] = useState<ImageRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const loadImages = async () => {
			try {
				setLoading(true);
				setError(null);
				const loadedImages = await databaseService.loadImages();
				setImages(loadedImages);
			} catch (err) {
				console.error("Failed to load images:", err);
				setError(err instanceof Error ? err.message : "Failed to load images");
			} finally {
				setLoading(false);
			}
		};

		loadImages();
	}, []);

	const handleImageSelect = (imageId: string) => {
		// Ensure we have a clean image ID
		const cleanImageId = extractImageId(imageId);
		// Navigate to the image URL instead of opening modal directly
		navigate(`/image/${cleanImageId}`);
	};

	if (loading) {
		return (
			<div className="main-map-view">
				<div className="loading-container">
					<div className="loading-spinner"></div>
					<p>Loading images...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="main-map-view">
				<div className="error-container">
					<h2>Error Loading Images</h2>
					<p>{error}</p>
					<button type="button" onClick={() => window.location.reload()}>
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="main-map-view">
			<header className="map-header">
				<h1>Spyo Map</h1>
				<div className="image-count">{images.length} geo-tagged images</div>
			</header>

			<div className="map-wrapper">
				<MapContainer
					images={images}
					selectedImageId={undefined}
					onImageSelect={handleImageSelect}
				/>
			</div>
		</div>
	);
};

export default MainMapView;
