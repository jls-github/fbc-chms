class AddCityAndStateToMembers < ActiveRecord::Migration[8.0]
  def change
    add_column :members, :city, :string
    add_column :members, :state, :string
  end
end
