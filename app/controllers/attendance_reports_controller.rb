class AttendanceReportsController < ApplicationController
  before_action :set_attendance_report, only: %i[ show edit update destroy ]

  # GET /attendance_reports or /attendance_reports.json
  def index
    @attendance_reports = AttendanceReport.order('date DESC').all.group_by(&:event_type)
    puts @attendance_reports
    @sunday_reports = @attendance_reports['sunday_service']&.map(&:decorate)
    @community_group_reports = @attendance_reports['community_group']&.map(&:decorate)
    @discipleship_meeting_reports = @attendance_reports['discipleship_meeting']&.map(&:decorate)
  end

  # GET /attendance_reports/1 or /attendance_reports/1.json
  def show
  end

  # GET /attendance_reports/new
  def new
    @attendance_report = AttendanceReport.new
  end

  # GET /attendance_reports/1/edit
  def edit
  end

  # POST /attendance_reports or /attendance_reports.json
  def create
    @attendance_report = AttendanceReport.new(attendance_report_params)

    respond_to do |format|
      if @attendance_report.save
        format.html { redirect_to @attendance_report, notice: "Attendance report was successfully created." }
        format.json { render :show, status: :created, location: @attendance_report }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: @attendance_report.errors, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /attendance_reports/1 or /attendance_reports/1.json
  def update
    respond_to do |format|
      if @attendance_report.update(attendance_report_params)
        format.html { redirect_to @attendance_report, notice: "Attendance report was successfully updated.", status: :see_other }
        format.json { render :show, status: :ok, location: @attendance_report }
      else
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render json: @attendance_report.errors, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /attendance_reports/1 or /attendance_reports/1.json
  def destroy
    @attendance_report.destroy!

    respond_to do |format|
      format.html { redirect_to attendance_reports_path, notice: "Attendance report was successfully destroyed.", status: :see_other }
      format.json { head :no_content }
    end
  end

  private
    # Use callbacks to share common setup or constraints between actions.
    def set_attendance_report
      @attendance_report = AttendanceReport.find(params.expect(:id)).decorate
    end

    # Only allow a list of trusted parameters through.
    def attendance_report_params
      params.expect(attendance_report: [ :event_type, :date, :attendance ])
    end
end
