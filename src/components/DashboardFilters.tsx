"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface DashboardFiltersProps {
  states: { id: string; name: string }[];
  districts: { id: string; name: string; stateId: string }[];
}

export default function DashboardFilters({ states, districts }: DashboardFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedStateId, setSelectedStateId] = useState(searchParams.get("stateId") || "");
  const [selectedDistrictId, setSelectedDistrictId] = useState(searchParams.get("districtId") || "");
  const [fromDate, setFromDate] = useState(searchParams.get("fromDate") || "");
  const [toDate, setToDate] = useState(searchParams.get("toDate") || "");
  const [districtSearch, setDistrictSearch] = useState("");

  const availableDistricts = selectedStateId
    ? districts.filter((d) => d.stateId === selectedStateId)
    : districts;

  const filteredDistricts = availableDistricts.filter((d) =>
    d.name.toLowerCase().includes(districtSearch.toLowerCase())
  );

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (selectedStateId) params.set("stateId", selectedStateId);
    if (selectedDistrictId) params.set("districtId", selectedDistrictId);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    setSelectedStateId("");
    setSelectedDistrictId("");
    setFromDate("");
    setToDate("");
    router.push("?");
  };

  const hasFilters = selectedStateId || selectedDistrictId || fromDate || toDate;

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* State Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">State/UT</label>
          <select
            value={selectedStateId}
            onChange={(e) => {
              setSelectedStateId(e.target.value);
              setSelectedDistrictId(""); // Reset district when state changes
              setDistrictSearch("");
            }}
            className="text-sm px-2 py-1.5 border border-border rounded"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* District Filter (with autocomplete) */}
        <div className="flex flex-col gap-1 relative">
          <label className="text-xs font-medium">District</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search district..."
              value={
                selectedDistrictId
                  ? availableDistricts.find((d) => d.id === selectedDistrictId)?.name || ""
                  : districtSearch
              }
              onChange={(e) => {
                setDistrictSearch(e.target.value);
                if (selectedDistrictId !== "") {
                  setSelectedDistrictId("");
                }
              }}
              className="text-sm px-2 py-1.5 border border-border rounded w-full"
              disabled={!selectedStateId && availableDistricts.length === 0}
            />
            {(districtSearch || selectedDistrictId) && availableDistricts.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded shadow-lg z-10 max-h-40 overflow-y-auto">
                {filteredDistricts.length > 0 ? (
                  filteredDistricts.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setSelectedDistrictId(d.id);
                        setDistrictSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b border-border last:border-b-0"
                    >
                      {d.name}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-muted">No districts found</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* From Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-sm px-2 py-1.5 border border-border rounded"
          />
        </div>

        {/* To Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-sm px-2 py-1.5 border border-border rounded"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={applyFilters}
          className="btn-primary text-sm px-4 py-1.5"
        >
          Apply Filters
        </button>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="btn-secondary text-sm px-4 py-1.5"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
