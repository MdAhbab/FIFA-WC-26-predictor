import { BrowserRouter, Route, Routes } from "react-router";
import { PicksProvider } from "./lib/PicksContext";
import { ThemeProvider } from "./lib/ThemeContext";
import { KickStage } from "./lib/KickFx";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import Home from "./pages/Home";
import Play from "./pages/Play";
import Predictions from "./pages/Predictions";
import Methodology from "./pages/Methodology";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Disclaimer from "./pages/Disclaimer";

export default function App() {
  return (
    <ThemeProvider>
      <PicksProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-background text-foreground">
            <Navbar />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/play" element={<Play />} />
                <Route path="/predictions" element={<Predictions />} />
                <Route path="/methodology" element={<Methodology />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/disclaimer" element={<Disclaimer />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </div>
            <Footer />
            <KickStage />
          </div>
        </BrowserRouter>
      </PicksProvider>
    </ThemeProvider>
  );
}
