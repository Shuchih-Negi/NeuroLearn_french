import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import AchievementToast from "./components/AchievementToast";
import PixelCursor from "./components/PixelCursor";
import HomePage from "./pages/HomePage";
import RoadmapPage from "./pages/RoadmapPage";
import LearnPage from "./pages/LearnPage";
import TestPage from "./pages/TestPage";
import FeedbackPage from "./pages/FeedbackPage";
import DashboardPage from "./pages/DashboardPage";
import ResearchPage from "./pages/ResearchPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <PixelCursor />
        <AchievementToast />
        <div className="crt-overlay" aria-hidden="true" />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/research" element={<ResearchPage />} />
          {/* Fallback: unknown routes land home */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
