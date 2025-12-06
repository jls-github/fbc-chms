class CreateMembers < ActiveRecord::Migration[8.0]
  def change
    create_table :members do |t|
      t.string :first_name
      t.string :last_name
      t.string :address_1
      t.string :address_2
      t.string :postal_code
      t.string :phone
      t.string :email

      t.timestamps
    end
  end
end
