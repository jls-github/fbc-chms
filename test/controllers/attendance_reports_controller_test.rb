require "test_helper"

class AttendanceReportsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @attendance_report = attendance_reports(:one)
  end

  test "should get index" do
    get attendance_reports_url
    assert_response :success
  end

  test "should get new" do
    get new_attendance_report_url
    assert_response :success
  end

  test "should create attendance_report" do
    assert_difference("AttendanceReport.count") do
      post attendance_reports_url, params: { attendance_report: { attendance: @attendance_report.attendance, date: @attendance_report.date, event_type: @attendance_report.event_type } }
    end

    assert_redirected_to attendance_report_url(AttendanceReport.last)
  end

  test "should show attendance_report" do
    get attendance_report_url(@attendance_report)
    assert_response :success
  end

  test "should get edit" do
    get edit_attendance_report_url(@attendance_report)
    assert_response :success
  end

  test "should update attendance_report" do
    patch attendance_report_url(@attendance_report), params: { attendance_report: { attendance: @attendance_report.attendance, date: @attendance_report.date, event_type: @attendance_report.event_type } }
    assert_redirected_to attendance_report_url(@attendance_report)
  end

  test "should destroy attendance_report" do
    assert_difference("AttendanceReport.count", -1) do
      delete attendance_report_url(@attendance_report)
    end

    assert_redirected_to attendance_reports_url
  end
end
